// https://docs.ethers.org/v6/getting-started/
let provider = null;
let signer = null;
let wallet = null;
let contract = null;
let reader = new ethers.Contract(CONTRACT_ADDR, CONTRACT_ABI, new ethers.JsonRpcProvider(CHAIN_RPC));
let rsupply = MAX_SUPPLY;
let minted_out = false;
let addr_proof = [];
let proof_cache = {};
let raw_chain_id = null;

// main
update_supply();
let tweet_modal = new bootstrap.Modal($('.modal')[0]);
$('.btn-tweet').attr('href', 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(TWEET_TEXT));

// enable tooltips
const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

// connect button
$('#connect').click(async _ => {
  if (window.ethereum === undefined) {
    alert('Please open by MetaMask browser');
    return;
  }

  // press button effect
  $('#connect').addClass('disabled');

  // connect metamask
  provider = new ethers.BrowserProvider(window.ethereum)
  signer = await provider.getSigner();

  // switch chain
  let changed = await switch_chain();
  if (changed) return;

  console.log('ðŸ’¬', 'connecting wallet..');

  // 1) check mint enabled
  /* reduce page load
  let mint_enabled = await reader.getFunction('mintEnabled').staticCall();
  if (!mint_enabled) {
    show_mint_disabled();
    return;
  }
  */

  // 2) check whitelist
  if (PROOF_URL != null) {
    let mm_addr = signer.address.toLowerCase();
    let c1 = mm_addr[2]; // 0x[_]
    let proofs = proof_cache[c1];
    if (!proofs) {
      let url = PROOF_URL + `${c1}.json?t=${+(new Date())}`;
      try {
        proofs = await $.get(url);
      }
      catch (err) {
        console.error(err);
        proofs = {};
      }
      proof_cache[c1] = proofs;
    }
    addr_proof = proofs[mm_addr] || [];
    let pass = addr_proof.length > 0;
    console.log(addr_proof, proof_cache);
    if (!pass) {
      show_wl_only();
      return;
    }
  }

  // get remaining qty
  let minted_qty = await reader.getFunction('numberMinted').staticCall(signer.address);
  let remaining_qty = MINT_PER_WALLET - parseInt(minted_qty);
  if (MAX_SUPPLY > 0) remaining_qty = Math.min(remaining_qty, rsupply);

  // update connect/disconnect buttons
  hide_connect();
  show_disconnect();

  // 1) mintable
  if (remaining_qty > 0) {
    $('#mint')
      .text(`Mint x${remaining_qty} (Free)`)
      .attr('qty', remaining_qty)
      .removeClass('d-none');
  }
  // 2) minted
  else {
    show_minted();
  }
});
$('#disconnect').click(_ => {
  $('#connect')
    .removeClass('disabled')
    .removeClass('d-none');
  $('#mint')
    .removeClass('disabled')
    .addClass('d-none');
  $('#minting').addClass('d-none');
  $('#msg').addClass('d-none');
  $('#disconnect').addClass('d-none');
  tweet_modal.hide();
});

// mint button
$('#mint').click(async _ => {
  $('#mint').addClass('d-none');
  $('#minting').removeClass('d-none');
  // recheck chain before mint
  let [ok, msg] = await validate_chain();
  if (!ok) {
    $('#mint').removeClass('d-none');
    $('#minting').addClass('d-none');
    alert(msg);
    return;
  }
  // mint
  let qty = +$('#mint').attr('qty');
  contract = new ethers.Contract(CONTRACT_ADDR, CONTRACT_ABI, signer);
  mint_by_gas_rate(contract, qty, addr_proof, MINT_GAS_RATE)
    .then(tx => {
      console.log(tx);
      return tx.wait();
    })
    .then(receipt => { // https://docs.ethers.org/v6/api/providers/#TransactionReceipt
      console.log(receipt);
      $('#minting').addClass('d-none');
      if (receipt.status != 1) { // 1 success, 0 revert
        alert(JSON.stringify(receipt.toJSON()));
        $('#mint').removeClass('d-none');
        return;
      }
      tweet_modal.show();
      play_party_effect();
      show_minted();
    })
    .catch(e => {
      alert(e);
      $('#mint').removeClass('d-none');
      $('#minting').addClass('d-none');
    });
});

if (window.ethereum) {
  // reconnect when switch account
  window.ethereum.on('accountsChanged', function (accounts) {
    if (minted_out) return;
    console.log('ðŸ’¬', 'changed account');
    $('#disconnect').click();
    is_chain_ready(_ => $('#connect').click());
  });
  // disconnect when switch chain
  window.ethereum.on('chainChanged', function (networkId) {
    raw_chain_id = networkId;
    if (minted_out) return;
    console.log('ðŸ’¬', 'changed chain');
    $('#disconnect').click();
    is_chain_ready(_ => $('#connect').click());
  });
}

// web3 functions
function update_supply() {
  $('#supply').html('Minted: ...');
  if (MAX_SUPPLY > 0) {
    reader.getFunction('remainingSupply').staticCall().then(s => {
      rsupply = parseInt(s);
      let minted = MAX_SUPPLY - rsupply;
      $('#supply').html(`Minted: ${minted}/${MAX_SUPPLY}`);
      // minted out ?
      minted_out = minted >= MAX_SUPPLY;
      if (!minted_out)
        $('#connect').removeClass('disabled');
      else
        show_minted_out();
    });
  }
  else { // open edition
    reader.getFunction('totalSupply').staticCall().then(s => {
      let minted = parseInt(s);
      $('#supply').html(`Minted: ${minted}/âˆž`);
      $('#connect').removeClass('disabled');
    });
  }
}
function is_chain_ready(callback) {
  let ready = parseInt(raw_chain_id) == CHAIN_ID;
  if (ready && callback) callback();
  return ready;
}
function handle_chain_exception(err) {
  let msg = `Please change network to [${CHAIN_NAME}] before mint.`;
  alert(`${msg}\n\n----- Error Info -----\n[${err.code}] ${err.message}`);
  $('#connect').removeClass('disabled');
}
async function validate_chain() {
  // https://ethereum.stackexchange.com/questions/134610/metamask-detectethereumprovider-check-is-connected-to-specific-chain
  let { chainId } = await provider.getNetwork();
  raw_chain_id = chainId;
  let ok = is_chain_ready();
  let msg = ok ? null : `Please change network to [${CHAIN_NAME}] before mint.`;
  return [ ok, msg ];
}
async function switch_chain() {
  // https://docs.metamask.io/wallet/reference/wallet_addethereumchain/
  let [ok, _] = await validate_chain();
  if (ok) return false;
  // switch chain
  try {
    await window.ethereum.request({
      "method": "wallet_switchEthereumChain",
      "params": [
        {
          "chainId": "0x" + CHAIN_ID.toString(16),
        }
      ]
    });
    return true;
  }
  // if chain not found, add chain
  catch(error) {
    if ([-32603, 4902].includes(error.code)) { // chain not added
      try {
        await window.ethereum.request({
          "method": "wallet_addEthereumChain",
          "params": [
            {
              "chainId": "0x" + CHAIN_ID.toString(16),
              "chainName": CHAIN_NAME,
              "rpcUrls": [
                CHAIN_RPC,
              ],
              //"iconUrls": [
              //  "https://xdaichain.com/fake/example/url/xdai.svg",
              //  "https://xdaichain.com/fake/example/url/xdai.png"
              //],
              "nativeCurrency": {
                "name": CHAIN_SYMBOL,
                "symbol": CHAIN_SYMBOL,
                "decimals": 18
              },
              "blockExplorerUrls": [
                CHAIN_EXPLORER,
              ]
            }
          ]
        });
      }
      catch(error) {
        handle_chain_exception(error);
      }
    }
    else {
      handle_chain_exception(error);
    }
    return true;
  }
}
async function mint_by_gas_rate(contract, qty, proof, gas_rate=1) {
  if (gas_rate == 1) {
    return contract.getFunction('mint').send(qty, proof);
  }
  else {
    let mint_fn = contract.getFunction('mint');
    let params = [ qty, proof ];
    let gas_limit = await mint_fn.estimateGas(...params);
    gas_limit = Math.ceil(Number(gas_limit) * gas_rate);
    return mint_fn.send(...params, { gasLimit: gas_limit });
  }
}
async function load_contract_obj() { // for console use
  provider = new ethers.BrowserProvider(window.ethereum)
  signer = await provider.getSigner();
  let [ok, msg] = await validate_chain();
  if (!ok) { console.warn(msg); return; }
  contract = new ethers.Contract(CONTRACT_ADDR, CONTRACT_ABI, signer);
  console.log('done');
}

// common
function short_addr(addr) {
  return addr.substr(0, 5) + '...' + addr.slice(-4);
}
function play_party_effect() {
  party.confetti(document.body, {
      count: 120,
      size: 2,
  });
}
function show_msg(msg, auto=false) {
  hide_connect();
  $('#msg').text(msg).removeClass('d-none');
  if (auto) show_disconnect();
}
function hide_connect() {
  return $('#connect').addClass('d-none');
}
function show_disconnect() {
  let btn = $('#disconnect').removeClass('d-none');
  if (signer != null) btn.text(`Disconnect ${short_addr(signer.address)}`);
  return btn;
}
let show_minted = _ => show_msg('Minted');
let show_wl_only = _ => show_msg("You're not eligible", true);
let show_minted_out = _ => show_msg('Minted Out');
let show_mint_disabled = _ => show_msg('Mint disabled');