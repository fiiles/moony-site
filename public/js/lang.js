// Open an English page in the visitor's language, and remember a language they pick themselves.
// The choice is made in the browser from its language list and from localStorage; the script makes no network request.
(function () {
  var script = document.currentScript;
  if (!script || !script.dataset) return;
  var data = script.dataset;
  var fallback = data['default'] || 'en';
  var supported = (data.locales || '').split(',').filter(Boolean);
  var base = data.base || '/';
  var KEY = 'moony-lang';
  var ALIASES = { no: 'nb', nn: 'nb' };

  function known(code) {
    return typeof code === 'string' && (code === fallback || supported.indexOf(code) !== -1);
  }

  var stored = null;
  var storageFailed = false;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {
    storageFailed = true;
  }
  if (!known(stored)) stored = null;

  function fromBrowser() {
    var list = [];
    try {
      list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    } catch (e) {}
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i] !== 'string') continue;
      var primary = list[i].toLowerCase().split(/[-_]/)[0];
      primary = ALIASES[primary] || primary;
      if (known(primary)) return primary;
    }
    return null;
  }

  function insideSite() {
    try {
      var ref = document.referrer || '';
      var origin = location.origin;
      return ref === origin || ref.indexOf(origin + '/') === 0;
    } catch (e) {
      return false;
    }
  }

  if ('auto' in data) {
    try {
      var target = stored;
      if (!target && !(storageFailed && insideSite())) target = fromBrowser();
      var path = location.pathname;
      var rest = path.indexOf(base) === 0 ? path.slice(base.length) : null;
      var inLocaleFolder = rest !== null && supported.indexOf(rest.split('/')[0]) !== -1;
      if (target && target !== fallback && rest !== null && !inLocaleFolder) {
        location.replace(base + target + '/' + rest + location.search + location.hash);
      }
    } catch (e) {}
  }

  function closeMenus() {
    var open = document.querySelectorAll('details.lang-menu[open]');
    for (var i = 0; i < open.length; i++) open[i].removeAttribute('open');
  }

  document.addEventListener('DOMContentLoaded', function () {
    function remember(event) {
      var node = event.target;
      if (!node || !node.closest) return null;
      var choice = node.closest('a[data-lang-choice]');
      if (choice) {
        var value = choice.getAttribute('data-lang-choice');
        if (known(value)) {
          try {
            localStorage.setItem(KEY, value);
          } catch (e) {}
        }
      }
      return node;
    }
    document.addEventListener('click', function (event) {
      var node = remember(event);
      if (node && !node.closest('details.lang-menu')) closeMenus();
    });
    // A middle-click opens the link in a new tab and fires auxclick, not click.
    document.addEventListener('auxclick', remember);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenus();
    });
  });
})();
