// The download button says "Download" until the platform is recognised; the labels are translated and carried on the button itself (data-mac, data-win, data-linux).
// Phones, tablets and Chromebooks keep the plain label: none of them can run the desktop installers.
(function () {
  var button = document.getElementById('dl-primary');
  var label = button && button.querySelector('span');
  if (!button || !label) return;
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var haystack = platform + ' ' + (navigator.userAgent || '');
  // iPadOS reports itself as a Mac; a real Mac has no multi-touch screen.
  var touchMac = /^mac/i.test(platform) && navigator.maxTouchPoints > 1;
  var other = /android|cros|chrome os|iphone|ipad|ipod/i.test(haystack) || touchMac;
  var text = other ? '' : /^mac/i.test(platform) ? button.dataset.mac : /^win/i.test(platform) ? button.dataset.win : /linux/i.test(platform) ? button.dataset.linux : '';
  if (text) label.textContent = text;
})();
