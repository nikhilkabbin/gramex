/* globals user, active_form_id, _user_form_config */
/* exported editor */

let editor
const options = {}
const template = {}
$('.field-actions').template({base: '.'})

$(window).on('click', function(e) {
  if(!$(e.target).closest('.edit-properties').length && !$(e.target).closest('.user-form').length) {
    $('.edit-properties').empty()
    $('.user-form > *').removeClass('highlight')
    $('.actions').addClass('d-none')
  }
})

fetch('snippets/snippets.json')
  .then(response => response.json())
  .then(json => {
    _.each(json, (val, dir) => {
      options[dir] = val.options
      const tmpl = template[dir] = _.template(val.template)
      let vals = _.mapValues(options[dir], v => v.value)
      vals['view'] = 'default'
      // component attribute is introduced to know html field
      // type attribute (which is already captured) conflicts with knowing field type since button field has a type attribute
      vals.component = dir
      // $("<div class='field-container'>" + '<g-text>' + tmpl(vals) + '</g-text>' + "</div>")
      if(dir === 'text') {
        $(tmpl(vals))
          .attr('data-type', dir)
          .attr('data-vals', JSON.stringify(vals))
          .appendTo('.form-fields')
      }
    })
    $('.edit-properties-container').css('height', $(document).innerHeight())
    // TODO: Can we ensure they all have a common parent class? I'll assume it's .form-group
    $('body').on('click', '.user-form > :not(.actions)', function () {
      $('.edit-properties').empty()
        .data('editing-element', $(this))
      $('.user-form > *').removeClass('highlight')
      $(this).addClass('highlight')
      $('.actions').insertBefore(this)
      $('.actions').removeClass('d-none')
      let field_vals = JSON.parse($(this).attr('data-vals')) || $(this).data('vals')
      _.each(options[$(this).data('type')], function (option, key) {
        let vals
        vals = _.mapValues(options[option.field], v => v.value)
        _.extend(vals, option)
        vals.value = field_vals[key]
        vals['view'] = 'editing'
        $(template[option.field](vals))
          .appendTo('.edit-properties')
          .addClass('form-element')
          .data('key', key)
          .data('field', option.field)
      })
    })
  }).then(function() {
    // render existing form using JSON
    if(active_form_id) {
      _.each(_user_form_config, function(opts) {
        let dir = opts.component
        opts['view'] = '...'
        $("<div class='field-container'>" + template[dir](opts) + "</div>")
          .attr('data-type', dir)
          .attr('data-vals', JSON.stringify(opts))
          .appendTo('.user-form')
      })
    }
  }).then(function() {
    parse_components()
  })

$('body').on('click', '#publish-form', function() {
  let _vals = {}
  $('.edit-properties > input, .edit-properties > input').each(function(ind, item) { _vals[item.id] = item.value })
  $('.user-form > *').removeClass('highlight')
  $('.edit-properties').empty()
  let $icon = $('<i class="fa fa-spinner fa-2x fa-fw align-middle"></i>').appendTo(this)

  let _md = {
    name: $('#form-name').text() || 'Untitled',
    categories: [],
    description: $('#form-description').text().trim()
  }
  let form_vals = []
  $('.user-form > :not(.actions)').each(function(ind, item) {
    let _vals = JSON.parse($(item).attr('data-vals'))
    _vals['component'] = $(item).attr('data-type')
    if(_vals.component === 'html')
      _vals.value = _vals.value.replace(/\n/g, "\\n")
    if(typeof item !== undefined) {
      form_vals.push(_vals)
    }
  })
  let form_details = {
    data: {
      config: JSON.stringify(form_vals),
      html: $('#user-form form').html(),
      metadata: JSON.stringify(_md),
      user: user
    }
  }

  if(active_form_id.length > 0) {
    form_details.data.id = active_form_id
    form_details.method = 'PUT'
    // update existing form
    $.ajax('publish', {
      method: 'PUT',
      data: form_details.data,
      success: function () {
        $('.post-publish').removeClass('d-none')
        $('.form-link').html(`<a href="form/${active_form_id}" target="_blank">View</a>`)
      },
      error: function () {
        $('.toast-body').html('Unable to update the form. Please try again later.')
        $('.toast').toast('show')
      },
      complete: function() { $icon.fadeOut() }
    })
  } else {
    // POST creates a new identifier
    delete form_details.data.id
    form_details.method = 'POST'
    $.ajax('publish', {
      method: form_details.method,
      data: form_details.data,
      success: function (response) {
        form_details.id = response.data.inserted[0].id
        $('.post-publish').removeClass('d-none')
        $('.form-link').html(`<a href="form/${form_details.id}" target="_blank">View</a>`)
        window.location.href = `create?id=${form_details.id}`
      },
      error: function () {
        $('.toast-body').html('Unable to publish the form. Please try again later.')
        $('.toast').toast('show')
      },
      complete: function() { $icon.fadeOut() }
    })
  }
}).on('click', '.form-fields > *', function() {
  var _type = $(this).data('type')
  let vals = _.mapValues(options[_type], v => v.value)
  vals['view'] = 'updating'
  $(`.form-fields > [data-type=${_type}]`)
    .data('type', _type)
    .data('vals', vals)
    .clone()
    .appendTo('.user-form')
  $('#publish-form').removeClass('d-none')
  $('.btn-link').removeClass('d-none')
  $('#addFieldModal').modal('hide')
}).on('click', '[data-action]', function() {
  const form_el = $(this).parent().parent().next()
  if($(this).data('action') === 'duplicate') {
    form_el.clone().insertAfter(form_el)
  } else if($(this).data('action') === 'delete') {
    form_el.remove()
  }
  $('.edit-properties').empty()
  $('.user-form > *').removeClass('highlight')
  $('.actions').addClass('d-none')
})

$('.edit-properties').on('input change', function () {
  let vals = {}
  $(':input', this).each(function () { vals[this.id] = this.value })
  var $el = $('.edit-properties').data('editing-element')
  var field = $($el).attr('data-type')
  let _v = ""
  vals['view'] = 'updating'
  // get all and stitch together
  // since radio and checkbox fields each support multiple options
  if(field === 'radio' || field === 'checkbox') {
    let tmpl_items = $(template[field](vals))
    _.each(tmpl_items, function(item) {
      if($(item).hasClass('form-check')) {
        _v += $(item).html().trim()
      }
    })
  } else {
    // $el includes outerHTML (.form-group onwards)
    // without .html(), the rendered template will contain .form-group > .form-group > input/select etc.
    // we need .form-group > input/select etc.
    _v = $(template[field](vals)).html().trim()
  }
  $el.html("<div class='field-container'>" + _v + "</div>")
    .attr('data-vals', JSON.stringify(vals))
  $('.field-actions').template({base: '.'})
  $('.actions').removeClass('d-none')
  $('.actions').insertBefore($el)
})
$('.user-form').on('submit', function(e) {
  e.preventDefault()
})

function parse_components() {
  document.querySelectorAll('script[type="text/html"][component]').forEach(component => {
    // Component tags use <prefix-componentname>. Get that componentname after the prefix-.
    const componentname = component.getAttribute('component').toLowerCase()
    const confignode = document.querySelector(`script[type="application/json"][component="${componentname}"]`)
    let config = {}, attrs = []

    if (confignode) {
      const configtext = confignode.innerHTML.trim()
      try {
        // Components MAY have a config defined. If so, they'll be in a script tag with
        // type="application/json" component="componentname". Parse contents as JSON and store it.
        config = JSON.parse(configtext)
        // The configuration MAY have an "options" key. This lists the names of observable attrs
        attrs = Object.keys(config.options || {})
      } catch (e) {
        console.log('Invalid config:', configtext, e)
      }
    }

    // Components MUST have a template defined in a script tag with
    // type="text/html" component="componentname". Parse it as a lodash template
    const template = _.template(component.innerHTML)
    class UIFactory extends HTMLElement {
      connectedCallback() {
        // Expose attributes as properties
        attrs.forEach(attr => {
          Object.defineProperty(this, attr, {
            get: function () { return this.getAttribute(attr) },
            set: function (val) { this.setAttribute(attr, val) }
          })
        })

        // this._options holds the object passed to the template.
        // Initialize this._options with default values.
        this._options = _.mapValues(config.options || {}, 'value')
        // Override with actual attributes and slots
        this._options.default = this.innerHTML
        for (var i=0, len=this.attributes.length; i < len; i++)
            this._options[this.attributes[i].name] = this.attributes[i].value

        // Remove the contents and store them for future access.
        // In the template, $('selector') returns the <selector> stored in this component.
        this._options._contents = document.createDocumentFragment()
        for (var child of this.querySelectorAll('*'))
          this._options._contents.appendChild(child)
        this._options.$ = this._options._contents.querySelector
        this._options.$$ = this._options._contents.querySelectorAll

        // this.render() re-renders the object based on current options.
        this.render()
      }

      render() {
        this.innerHTML = template(this._options)
      }

      // The list of attributes to watch for changes on is based on the keys of
      // config.options, When any of these change, attributeChangedCallback is called.
      static get observedAttributes() {
        return attrs
      }

      // When any attribute changes, update this._options and re-render
      attributeChangedCallback(name, oldValue, newValue) {
        if (this._options) {
          this._options[name] = newValue
          this.render()
        }
      }
    }
    customElements.define(`g-${componentname}`, UIFactory)
  })

}
