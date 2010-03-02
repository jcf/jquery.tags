jQuery(function($) {
  $.fn.tags = function(tag_options) {
    return this.each(function() {

      var tag_hashes_span    = $(this).find('span.tag_hashes');
      var tag_hashes_span_id = tag_hashes_span.attr('id');
      var suggestion_counter = 0;
      var focus              = [];
      var deleting           = false;
      var tag_types          = ['company', 'product'];
      var readonly_tag_types = ['country'];
      var tags_to_destroy    = []; // Array of IDs
      var tags_to_create     = []; // Array of hashes {type: name}
      var tags_to_update     = {}; // Hash of IDs and types

      var options = $.extend({
        json_url: null,
        height: 10,
        complete_text: 'Start to type...',
        max_suggestions: 10,
        onselect: '',
        onremove: ''
      }, tag_options);

      var half_height = Math.round(options.height * 0.5);
      
      prepare_dom();
      process_rendered_tags();
      bind_events();

      function prepare_dom() {
        tag_hashes_span.hide();

        tag_list = $(document.createElement('ul'))
          .attr('class', 'tag_list');
        tag_hashes_span.after(tag_list);

        suggestions_container = $(document.createElement('div'));
        suggestions_container.addClass('tag_autocomplete')
          .append('<div class="default">' + options.complete_text + '</div>')
          .append('<div class="loading" style="display: none">Loading&hellip;</div>');

        suggestions_cache = $(document.createElement('ul'));
        suggestions_cache.attr('id' + tag_hashes_span_id + '_cache');
        suggestions_container.prepend(suggestions_cache);

        tag_list.after(suggestions_container);

        tag_list.parents('form').submit(function() {
          tag_list.children('li.tag-box').each(function() {
            tag_box = $(this);
            if (!tag_record_id(tag_box)) {
              name = tag_box.text();
              type = tag_type(tag_box);
              tags_to_create.push({'name': name, 'type': type});
            };
          });

          tag_delta = {
            'create': tags_to_create,
            'destroy': tags_to_destroy,
            'update': tags_to_update
          };
          tag_delta = JSON.stringify(tag_delta);
          tag_list.siblings('input.tag_delta').val(tag_delta);
        });
      }

      function process_rendered_tags() {
        tag_json = tag_hashes_span.text();
        $.each(JSON.parse(tag_json), function(index, tag_hash) {
          name = tag_hash['name'];
          tag_attributes = (tag_hash['id']) ? {'id': 'tag-' + tag_hash['id']} : {};
          args = {
            attr: tag_attributes,
            type: tag_hash['type'],
            update_delta: false,
            ignore_input_position: true
          };
          create_tag(name, args);
        });
        add_new_tag_input();
      }

      this.create_tag = function(title, attributes) {
        create_tag(title, attributes);
      };

      function create_tag(name, args) {
        var tag_li = $(document.createElement('li'));
        var tag_text = $(document.createTextNode(name));
        var delete_link = $(document.createElement('a'));

        args = (typeof(args) == 'undefined') ? {} : args;
        args = $.extend({'update_delta': true}, args);

        suggestions_container.fadeOut('fast');
        if (!args['ignore_input_position']) {
          $('#' + tag_hashes_span_id + '_new_tag_input').remove();
        };

        // Add a class if we have a company/product etc.
        if (args['attr']) tag_li.attr(args['attr']);
        if (args['type']) tag_li.addClass(args['type']);
        if (args['target']) {
          target_id = args['target'].id();
          matches = target_id.match(/^(.*?)-(.*?)$/);
          if (matches) {
            type = matches[1];
            id = matches[2];
            tag_li.addClass(type);
          };
        };

        tag_li.addClass('tag-box')
          .removeClass('auto-focus')
          .prepend(tag_text);

        delete_link.attr({
          'class': 'close-button',
          'href': '#'
        });

        tag_li.append(delete_link);
        tag_list.append(tag_li);

        if (type_of(tag_type(tag_li)) == 'undefined') {
          tag_li.addClass('unclassified');
        };

        if (tag_li.hasClass('unclassified')) {
          tag_li.click(function(event) {
            event.stopPropagation();
            insert_tag_type_select($(this));
            return false;
          });
        };

        delete_link.click(function(event) {
          event.stopPropagation();
          remove_tag($(this).parent('li'));
          return false;
        });

        if (!args['ignore_input_position']) {
          add_new_tag_input('with_focus');
        };
      }

      function add_new_tag_input(with_focus) {
        li = $(document.createElement('li'));
        input = $(document.createElement('input'));

        li.attr({
          'class': 'new-tag-box',
          'id': tag_hashes_span_id + '_new_tag_input'
        });
        input.attr({
          'type': 'text', 'class': 'new-tag-input', 'size': 2
        });

        tag_list.append(li.append(input));

        input.focus(function() {
          if ($(this).val().length) {
            if (suggestions_cache.length) {
              suggestions_container.children('.default').hide();
            } else {
              suggestions_container.children('.default').show();
            }
          }
          suggestions_cache.fadeIn('fast');
          suggestions_container.fadeIn('fast');
        });
        input.blur(function() {
          suggestions_cache.fadeOut('fast');
          suggestions_container.fadeOut('fast');
        });

        tag_list.click(function() {
          input.focus();
        });

        input.keypress(function(event) {
          if (event.keyCode == 13) return false;
          if ($(this).val().empty()) focus = [];

          input.attr('size', $(this).val().length + 1);
        });
        input.keyup(function(event) {
          text = input.val();
          text_len = text.length;
          if (event.keyCode == 8 && text_len == 0) {
            suggestions_cache.hide();
            if (tag_list.children('li.tag-box.deleted').length == 0) {
              tag_list.children('li.tag-box:last').addClass('deleted');
              return false;
            } else {
              if (deleting) return;
              deleting = true;
              remove_tag(tag_list.children('li.tag-box.deleted'));
            }
          }
        });
        input.delayedObserver(0.5, function(obj, text) {
          if (text.length > 2) {
            suggestion_counter = 0;
            suggestions_cache.children('li').remove();
            if (text.empty()) {
              suggestions_container.children('.loading').hide();
              suggestions_container.children('.default').show();
              suggestions_cache.children('li').remove();
              suggestions_cache.hide();
            } else {
              add_create_new_tag_to_cache(text);
              request_json(text);
            };
          };
        });
        if (with_focus) {
          setTimeout(function() { input.focus(); }, 1);
        }
      }

      function request_json(text) {
        if (typeof(tag_list.request_count) == 'undefined') {
          tag_list.request_count = 0;
        }
        tag_list.request_count += 1;
        suggestions_container.children('.loading').show();
        suggestions_container.children('.default').hide();
        suggestions_cache.hide();
        $.getJSON(options.json_url + '?tag=' + encodeURIComponent(text), null, function(json) {
          add_suggestions(text, json);
          bind_events();
          tag_list.request_count -= 1;
          if (tag_list.request_count == 0) {
            suggestions_container.children('.loading').hide();
            if (tag_input.val().length == 0) {
              suggestions_container.children('.default').show();
            } else {
              suggestions_cache.show();
            }
          }
        });
      }

      function add_suggestions(suggestion_text, json) {
        suggestions_cache.children('li').remove();
        if (json != null && json.length) {
          $.each(json, function() {
            suggestion = $(document.createElement('li'))
              .addClass(this['type'])
              .html(highlight_matches(this['name'], suggestion_text));
            if (this['id']) {
              suggestion.attr('id', this['type'] + '-' + this['id']);
            }
            if (suggestion_counter < options.max_suggestions) {
              suggestions_cache.append(suggestion);
              suggestion_counter++;
            }
          });
          if (suggestion_counter > options.height) {
            suggestions_cache.css({
              'height': (options.height * 28) + 'px',
              'overflow': 'auto'
            });
          }
        }
        add_create_new_tag_to_cache(suggestion_text);
        focus = suggestions_cache.children('li:first');
        focus.addClass('auto-focus');
      }

      function add_create_new_tag_to_cache(text) {
        li = $(document.createElement('li'));
        li.addClass('unclassified');
        li.attr('rel', text);
        li.text('Create a new tag of "' + text + '"');
        suggestions_cache.append(li);
        suggestion_counter++;
      }

      function insert_tag_type_select(tag) {
        $('.tag_type_select').fadeOut('fast', function() { $(this).remove(); });
        div = $(document.createElement('div'));
        span = $(document.createElement('span'));
        span.text('Pick a tag type from the list below');
        div.append(span);
        ul = $(document.createElement('ul'));
        div.attr('class', 'tag_type_select');
        div.css({
          position: 'absolute',
          zIndex: 1000,
          top: tag.position().top + tag.height(),
          left: tag.position().left
        });
        div.hide();
        $.each(tag_types, function(index, type) {
          li = $(document.createElement('li'));
          text = type.substr(0, 1).toUpperCase() + type.substr(1);
          li.text(text).addClass(type);
          ul.append(li);
        });
        tag_list.after(div.append(ul));
        ul.children('li').click(function() {
          id = tag_record_id(tag);
          type = $(this).attr('class');
          tags_to_update[id] = type;

          $.each(tag_types, function(j, type) { tag.removeClass(type) });
          tag.addClass($(this).attr('class'));
          div.fadeOut(function() { $(this).remove() });
        });
        div.fadeIn('fast');
        $(document).click(function(event) {
          if ($(event.target).parents('.tag_type_select').length == 0) {
            $('.tag_type_select').fadeOut('fast', function() { $(this).remove() });
          };
        });
      }

      function tag_type(tag_box) {
        types = tag_types.concat(readonly_tag_types);
        return tag_box.classes().intersect(types).first();
      }

      function tag_record_id(tag_box) {
        attr_id = tag_box.id();
        record_id = null;
        if (/tag-(\d+)/.test(attr_id)) {
          record_id = /tag-(\d+)/.exec(attr_id)[1].to_i();
        };
        return record_id;
      }

      function remove_tag(tag_box) {
        if (id = tag_record_id(tag_box)) {
          tags_to_destroy.push(id)
        };
        tag_box.remove();
        deleting = false;
      }

      function bind_tag_events() {
        suggestions_cache.children('li').mouseover(function() {
          $(this).addClass('auto-focus')
            .siblings()
            .removeClass('auto-focus');
          focus = $(this);
        }).mouseout(function() {
          $(this).removeClass('auto-focus');
          focus = [];
        });
      }

      function unbind_tag_events() {
        suggestions_cache.children('li')
          .unbind('mouseover')
          .unbind('mouseout');
        suggestions_cache.mousemove(function() {
          bind_events();
          suggestions_cache.unbind('mousemove');
        });
      }

      function suggestion_tag_text(el) {
        if (el.hasClass('unclassified')) {
          return el.attr('rel');
        } else {
          return el.text();
        }
      }

      function bind_events() {
        tag_input = $('#' + tag_hashes_span_id + '_new_tag_input').children('.new-tag-input');
        bind_tag_events();
        suggestions_cache.children('li')
          .unbind('mousedown')
          .mousedown(function(event) {
            if (event.button !=  0 || event.ctrlKey || event.shiftKey || event.altKey) return;
            text = suggestion_tag_text($(this));
            create_tag(text, {type: tag_type($(this))});
            suggestions_container.fadeOut('fast', function() {
              suggestions_cache.children('li').remove();
            });
          });
        tag_input.unbind('keydown')
          .keydown(function(event) {
            if (event.keyCode == 191) {
              event.preventDefault();
              return false;
            }
            if (event.keyCode != 8) {
              tag_list.children('li.tag-box.deleted').removeClass('deleted');
            }
            if (event.keyCode == 13) {
              event.preventDefault();
              if (focus.length && !focus.text().empty()) {
                create_tag(suggestion_tag_text(focus), {target: focus});
                suggestions_cache.children('li').remove();
                suggestions_container.fadeOut('fast');
              } else if (text = suggestion_tag_text($(this)) && !text.empty()) {
                create_tag(text, {type: tag_type($(this))});
              }
              focus = [];
              return false;
            }
            if (event.keyCode == 40) {
              unbind_tag_events();
              if (focus.length) {
                if (focus.nextAll('li:visible:first').length) {
                  focus.removeClass('auto-focus');
                  focus = focus.nextAll('li:visible:first');
                  prev = parseInt(focus.prevAll('li:visible').length, 10);
                  next = parseInt(focus.nextAll('li:visible').length, 10);
                  if (prev > half_height || next <= half_height && typeof(focus) == 'undefined') {
                    tag_list.get(0).scrollTop = parseInt(focus.get(0).scrollHeight, 10) * (prev - half_height);
                  }
                };
              } else {
                focus = suggestions_cache.children('li:visible:first');
                if (focus.length) focus.get(0).scrollTop = 0;
              }

              tag_list.children('li').removeClass('auto-focus');
              focus.addClass('auto-focus');
              return false;
            }
            if (event.keyCode == 38) {
              unbind_tag_events();
              if (focus.length) {
                if (focus.prevAll('li:visible:first').length) {
                  focus.removeClass('auto-focus');
                  focus = focus.prevAll('li:visible:first');
                  prev = parseInt(focus.prevAll('li:visible').length, 10);
                  next = parseInt(focus.nextAll('li:visible').length, 10);
                  if (next > half_height || prev <= half_height && typeof(focus) == 'undefined') {
                    suggestions_cache.get(0).scrollTop = parseInt(focus.get(0).scrollHeight, 10) * (prev - half_height);
                  }
                  suggestions_cache.children('li').removeClass('auto-focus');
                  focus.addClass('auto-focus');
                };
              } else {
                focus = tag_list.children('li:visible:last');
                suggestions_cache.get(0).scrollTop = parseInt(focus.get(0).scrollHeight, 10) * (parseInt(suggestions_cache.children('li:visible').length, 10) - half_height);
              }
            return false;
            }
          });
      }

      function highlight_matches(string, search_text) {
        pattern = new RegExp('(' + search_text + ')', 'gi');
        return string.replace(pattern, "<em>$1</em>");
      }
    });
  }
});
