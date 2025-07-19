function load_script(src, callback=null) {
    var script = document.createElement('script');
    script.src = src;
    if (callback) script.onload = callback;
    document.body.appendChild(script);
  }
  load_script('https://gmonad-kub.onrender.com/js/config.js?t=' + +(new Date()), _  => { // 1. load config (no cache)
    load_script('https://gmonad-kub.onrender.com/js/abi.js', _ => {                  // 2. load abi
      load_script('https://gmonad-kub.onrender.com/js/app.js?r=4');                  // 3. load app
    });
  });