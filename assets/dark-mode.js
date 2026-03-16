/* Dark mode toggle with system preference detection and localStorage persistence */

(function () {
  var html = document.documentElement
  var STORAGE_KEY = 'slackin-theme'
  var THEME_LIGHT = 'light'
  var THEME_DARK = 'dark'

  // Get initial theme from localStorage or system preference
  function getInitialTheme() {
    var stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return stored
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEME_DARK
    }

    return THEME_LIGHT
  }

  // Apply theme to HTML element
  function applyTheme(theme) {
    // Remove both theme classes
    html.classList.remove('theme-' + THEME_LIGHT)
    html.classList.remove('theme-' + THEME_DARK)

    // Add the selected theme class
    html.classList.add('theme-' + theme)

    // Update toggle button if it exists
    var toggle = document.getElementById('theme-toggle')
    if (toggle) {
      toggle.setAttribute('aria-label', 'Switch to ' + (theme === THEME_DARK ? 'light' : 'dark') + ' mode')
      toggle.title = 'Switch to ' + (theme === THEME_DARK ? 'light' : 'dark') + ' mode'
    }
  }

  // Toggle between light and dark
  function toggleTheme() {
    var currentTheme = html.classList.contains('theme-' + THEME_DARK) ? THEME_DARK : THEME_LIGHT
    var newTheme = currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK

    applyTheme(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }

  // Apply initial theme immediately (before page load to prevent flash)
  var initialTheme = getInitialTheme()
  applyTheme(initialTheme)

  // Listen for system preference changes
  if (window.matchMedia) {
    var darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    var handleChange = function (e) {
      // Only auto-switch if user hasn't set a preference
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? THEME_DARK : THEME_LIGHT)
      }
    }

    if (darkModeQuery.addEventListener) {
      darkModeQuery.addEventListener('change', handleChange)
    } else if (darkModeQuery.addListener) {
      // Legacy support
      darkModeQuery.addListener(handleChange)
    }
  }

  // Add toggle button to page
  document.addEventListener('DOMContentLoaded', function () {
    var splash = document.querySelector('.splash')
    if (!splash) return

    var toggle = document.createElement('button')
    toggle.id = 'theme-toggle'
    toggle.className = 'theme-toggle'
    toggle.setAttribute('type', 'button')
    toggle.setAttribute('aria-label', 'Toggle dark mode')
    toggle.title = 'Toggle dark mode'

    // Create SVG icon using DOM methods (more secure than innerHTML)
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '20')
    svg.setAttribute('height', '20')
    svg.setAttribute('viewBox', '0 0 20 20')
    svg.setAttribute('fill', 'currentColor')

    // Sun icon path
    var sunPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    sunPath.setAttribute('class', 'sun')
    sunPath.setAttribute('d', 'M10 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 10a3 3 0 100-6 3 3 0 000 6zm0 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3 10a1 1 0 011-1h1a1 1 0 110 2H4a1 1 0 01-1-1zm12 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM5.05 5.05a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zm9.9 9.9a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zm-9.9 0a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zm9.9-9.9a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0z')

    // Moon icon path
    var moonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    moonPath.setAttribute('class', 'moon')
    moonPath.setAttribute('d', 'M10 2a8 8 0 108 8 8.009 8.009 0 00-8-8zm0 14a6 6 0 116-6 6.007 6.007 0 01-6 6z')

    svg.appendChild(sunPath)
    svg.appendChild(moonPath)
    toggle.appendChild(svg)

    toggle.addEventListener('click', toggleTheme)

    // Insert toggle button at the top of splash
    splash.insertBefore(toggle, splash.firstChild)
  })
})()
