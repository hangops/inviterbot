/* globals data:false */

(function () {
  // give up and resort to `target=_blank`
  // if we're not modern enough
  if (!document.body.getBoundingClientRect
   || !document.body.querySelectorAll
   || !window.postMessage) {
    return
  }

  // the id for the script we capture
  var id

  // listen on setup event from the parent
  // to set up the id
  window.addEventListener('message', function onmsg(e) {
    if (/^slackin:/.test(e.data)) {
      id = e.data.replace(/^slackin:/, '')
      document.body.addEventListener('click', function (ev) {
        var el = ev.target
        while (el && el.nodeName !== 'A') el = el.parentNode
        if (el && el.target === '_blank') {
          ev.preventDefault()
          window.parent.postMessage('slackin-click:' + id, '*')
        }
      })
      window.removeEventListener('message', onmsg)

      // notify initial width
      refresh()
    }
  })

  // notify parent about current width
  var button = document.querySelector('.slack-button')
  var lastWidth
  function refresh() {
    if (window !== window.top && window.postMessage) {
      var width = Math.ceil(button.getBoundingClientRect().width)
      if (lastWidth !== width) {
        lastWidth = width
        window.parent.postMessage('slackin-width:' + id + ':' + width, '*')
      }
    }
  }

  // polling updates (replaces socket.io real-time updates)
  var count = document.querySelector('.slack-count')
  var anim

  function pollData() {
    fetch(data.path + 'data')
      .then(function (response) {
        return response.json()
      })
      .then(function (users) {
        if (users.total !== undefined) {
          update('total', users.total)
        }
        if (users.active !== undefined) {
          update('active', users.active)
        }
      })
      .catch(function (err) {
        // Silently fail - will retry on next poll
        console.error('Failed to fetch data:', err)
      })
  }

  function update(key, n) {
    if (data[key] !== n) {
      data[key] = n
      var str = ''
      if (data.active) str = data.active + '/'
      if (data.total) str += data.total
      if (!str.length) str = '–'
      if (anim) clearTimeout(anim)
      count.textContent = str
      count.classList.add('anim')
      anim = setTimeout(function () {
        count.classList.remove('anim')
      }, 200)
      refresh()
    }
  }

  // Poll every 30 seconds for user count updates
  setInterval(pollData, 30000)
}())
