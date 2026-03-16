/* globals data:false, grecaptcha:false */

var body = document.body

// elements
var form = body.querySelector('form#invite')
var channel = form.elements.channel || {}
var email = form.elements.email
var coc = form.elements.coc
var button = body.querySelector('button')

// remove loading state
button.classList.remove('loading')

// capture submit
function submitForm(ev) {
  if (ev) ev.preventDefault()
  button.disabled = true
  button.classList.remove('loading')
  button.classList.remove('error')
  button.classList.remove('success')
  button.textContent = 'Please Wait'
  var gcaptcha_response = form.elements['g-recaptcha-response']
  var gcaptcha_token = gcaptcha_response ? gcaptcha_response.value : ''

  if (!gcaptcha_token && document.getElementById('h-captcha')) {
    return grecaptcha.execute()
  }

  invite(channel ? channel.value : null, coc && coc.checked ? 1 : 0, email.value, gcaptcha_token, function (err, msg) {
    if (err) {
      button.removeAttribute('disabled')
      button.classList.add('error')
      button.textContent = err.message
    } else {
      button.classList.add('success')
      button.textContent = msg
    }
  })
}

body.addEventListener('submit', submitForm)

function invite(chan, coc, email, gcaptcha_response_value, fn) {
  fetch(data.path + 'invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      'g-recaptcha-response': gcaptcha_response_value,
      coc: coc,
      channel: chan,
      email: email
    })
  })
    .then(function (response) {
      return response.json().then(function (body) {
        return { status: response.status, body: body }
      })
    })
    .then(function (res) {
      if (res.body && res.body.redirectUrl) {
        window.setTimeout(function () {
          topLevelRedirect(res.body.redirectUrl)
        }, 1500)
      }

      if (res.status !== 200) {
        return fn(new Error(res.body.msg || 'Server error'))
      }

      fn(null, 'Invite sent')
    })
    .catch(function (err) {
      fn(new Error('Network error: ' + err.message))
    })
}

// polling updates (replaces socket.io real-time updates)
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

// Poll every 30 seconds for user count updates
setInterval(pollData, 30000)

function update(val, n) {
  var el = document.querySelector('.' + val)
  if (el && el.textContent !== String(n)) {
    el.textContent = n
    anim(el)
  }
}

function anim(el) {
  if (el.anim) return
  el.classList.add('grow')
  el.anim = setTimeout(function () {
    el.classList.remove('grow')
    el.anim = null
  }, 150)
}

// redirect, using "RPC" to parent if necessary
function topLevelRedirect(url) {
  if (window === window.top) window.location.href = url
  else window.parent.postMessage('slackin-redirect:' + id + ':' + url, '*')
  // Q: Why can't we just `top.location.href = url;`?
  // A:
  // [sandboxing]: http://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/
  // [CSP]: http://www.html5rocks.com/en/tutorials/security/content-security-policy/
  // [nope]: http://output.jsbin.com/popawuk/16
}

// "RPC" channel to parent
var id
window.addEventListener('message', function onmsg(e) {
  if (/^slackin:/.test(e.data)) {
    id = e.data.replace(/^slackin:/, '')
    window.removeEventListener('message', onmsg)
  }
})

body.addEventListener('load', function () {
  if (window.location.hash) {
    body.querySelector('select[name=channel]').value = window.location.hash.slice(1)
  }
})
