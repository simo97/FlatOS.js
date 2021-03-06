(function ($) {

    const this_process_name = 'flatos_docwriter';

    var _w = new FlatOS.Window(this_process_name),
        _i = _w.getInstanceID(),
        _t = new FlatOS.UI.Taskbar({process_name: this_process_name, instance_id: _i}),
        _a = new FlatOS.Application(this_process_name),
        _m = new FlatOS.Input.Mouse(),
        _u = new FlatOS.System.User(),
        _f = new FlatOS.System.FS();


    var $_w = _w.get();

    var file_info = {},
        currPanel = 0,
        prevpanel;

    var editor = null,
        stack,
        range,
        inspector,
        tools = {},
        imageDialog,
        tableDialog,
        modal,
        flashUI,
        clipboard;

    var showFilePanel = true;

    var page_contents_element = null;

    var autosave_interval = 0;

    var user_config = null;

    var load_user_config = function () {
        user_config = _a.getUserConfig();
        return user_config;
    };

    var add_to_recents = function (path) {
        if (user_config === null) {
            load_user_config();
            add_to_recents(path);
        }
        else {
            if (~user_config.lastOpened.indexOf(path)) {
                var i = user_config.lastOpened.indexOf(path);
                var a = user_config.lastOpened.slice(0, i);
                var b = user_config.lastOpened.slice(i+1, user_config.lastOpened.length);
                user_config.lastOpened = a.concat(b);
            }
            user_config.lastOpened.unshift(path);
            _a.setUserConfig(user_config);
        }
    };

    var update_file_panel_visibility = function () {
        if (showFilePanel) {
            $_w.find('.panel-file').removeClass('hide');
            if (editor) {
                $_w.find('.panel-file').find('.option.back_icon').removeClass('hide');
                $_w.find('.panel-file').find('.option.save').removeClass('hide');
                $_w.find('.panel-file').find('.option.export').removeClass('hide');
            }
            else {
                $_w.find('.panel-file').find('.option.back_icon').addClass('hide');
                $_w.find('.panel-file').find('.option.save').addClass('hide');
                $_w.find('.panel-file').find('.option.export').addClass('hide');
            }
        }
        else {
            $_w.find('.panel-file').addClass('hide');
        }
    };

    var update_panels_sizes = function () {
        $_w.find('.panel').each(function() {
            var panel_width = 0;
            $(this).find('.command_group').each(function () {
                panel_width += $(this).outerWidth(true);
            });
            if (panel_width > _w.width()) {
                $(this).width(panel_width);
            }
            else {
                $(this).width('100%');
            }
        });
    };

    var update_page_margin = function () {
        var page = $_w.find('.docwriter_document_page');
        var wrap = $_w.find('.docwriter_pages');
        var more = wrap.outerWidth() - page.outerWidth();
        if (wrap.outerHeight() < page.outerHeight()) {
            more -= 15;
        }
        var left = parseInt(more / 2);
        page.css('margin-left', (left < 0 ? 0 : left));
    };

    var load_samples = function (callback) {
        var samples_path = _f.toInternalPath(_a.getPath() + '/samples');
        if ($.isFunction(callback)) {
            new FlatOS.Api.FS(function (samples_list) {
                callback(samples_list);
            }).readDir(samples_path);
        }
    };

    var init_docwriter = function () {
        $_w.find('.toolbox_ribbon').addClass('hide');
        $(window.frames["docwriter_print_frame_support"].document).find('head').append('<link href="' + _a.getURI() + '/print.css" rel="stylesheet" type="text/css">');

        ContentTools.RESTRICTED_ATTRIBUTES = {
            '*': ['class'],
            'img': ['height', 'src', 'width', 'data-ce-max-width', 'data-ce-min-width'],
            'iframe': ['height', 'width']
        };

        ContentTools.StylePalette.add([
            new ContentTools.Style('No Border', 'table-noborder', ['table']),
            new ContentTools.Style('External Border Only', 'table-externalborder', ['table']),
            new ContentTools.Style('Internal Border Only', 'table-internalborder', ['table']),

            new ContentTools.Style('Decimal Bullets', 'list-style-type-decimal', ['ol']),
            new ContentTools.Style('Decimal Bullets Starting With Zero', 'list-style-type-decimal-leading-zero', ['ol']),
            new ContentTools.Style('Lower Roman Bullets', 'list-style-type-lower-roman', ['ol']),
            new ContentTools.Style('Upper Roman Bullets', 'list-style-type-upper-roman', ['ol']),
            new ContentTools.Style('Lower Alpha Bullets', 'list-style-type-lower-alpha', ['ol']),
            new ContentTools.Style('Upper Alpha Bullets', 'list-style-type-upper-alpha', ['ol']),
            new ContentTools.Style('Disc Bullets', 'list-style-type-disc', ['ul']),
            new ContentTools.Style('Circle Bullets', 'list-style-type-circle', ['ul']),
            new ContentTools.Style('Square Bullets', 'list-style-type-square', ['ul']),
            new ContentTools.Style('No Bullets', 'list-style-type-none', ['ol', 'ul'])
        ]);
    };

    var add_page = function () {
        $_w.find('.docwriter_pages').append('<div class="docwriter_document_page"><div class="docwriter_document_page_content" data-editable data-name="docwriter_document"><p></p></div></div>');

        page_contents_element = $_w.find('.docwriter_document_page_content').get(0);
        var ct_app = ($_w.find('.ct-app').length > 0) ? $_w.find('.ct-app').eq(0) : $('<div/>').addClass('ct-app').appendTo($_w.find('.main-content').eq(0));

        editor = ContentTools.EditorApp.get();

        editor.mount(ct_app.get(0));
        editor.init($(page_contents_element), 'data-name');

        inspector = editor.inspector();

        if (editor && !editor.isEditing()) {
            editor.start();
        }

        ct_app.appendTo($_w.find('.docwriter_pages_wrapper'));
        ct_app.children('.ct-ignition').remove();
        // ct_app.children('.ct-inspector').remove();
        ct_app.children('.ct-toolbox').remove();
    };

    var destroy_page = function () {
        editor.destroy();
        $_w.find('.docwriter_document_page').remove();
    };

    var getParentNode = function (el, until) {
        var target = el.parentNode;
        if (typeof until != 'undefined') {
            if (target && target.tagName != until) {
                return getParentNode(target, until);
            }
        }
        return target;
    };

    var update_views = function (panel_id) {
        var $wrapper = $_w.find(".mainviews"),
            $parent = $wrapper.parent('.panel-file'),
            $panels = $wrapper.find('.mainview'),
            $buttons = $parent.find('.option.switcher');

        $buttons.removeClass('active');
        $buttons.filter('[data-view="' + panel_id + '"]').addClass('active');

        $panels.hide(0, function () {
            $panels.filter('[data-view="' + panel_id + '"]').show(0);
        });
    };

    var init_views = function () {
        var $wrapper = $_w.find(".mainviews"),
            $parent = $wrapper.parent('.panel-file'),
            $panels = $wrapper.find('.mainview'),
            $buttons = $parent.find('.option.switcher');

        var currpanelid = $panels.eq(currPanel).attr('data-view');

        if (typeof prevpanel === 'undefined') {
            prevpanel = currpanelid;
        }

        $buttons.each(function () {
            var $a = $(this);
            _m.leftClick('docwriter.view.switch', $a, function (e) {
                e.preventDefault();
                e.stopPropagation();
                if ($a.hasClass('disable-switch')) {
                    return false;
                } else {
                    prevpanel = currpanelid;
                    update_views($a.attr('data-view'));
                }
            });
        });

        update_views(currpanelid);
    };

    var update_panels = function (panel_id) {
        var $wrapper = $_w.find(".panels"),
            $parent = $wrapper.parent('.panel-wrapper'),
            $panels = $wrapper.find('.panel'),
            $buttons = $parent.find('.panel-switcher');

        $buttons.removeClass('active');
        $buttons.filter('[href="' + panel_id + '"]').addClass('active');

        $panels.hide(0, function () {
            $panels.filter(panel_id).show(0, function () {
                update_panels_sizes();
            });
        });
    };

    var update_panels_visibility = function () {
        if (editor && editor.isEditing()) {
            $_w.find('.panel-wrapper').removeClass('hide');
            $_w.find('.docwriter_pages_wrapper').removeClass('full readmode');
        }
        else {
            $_w.find('.panel-wrapper').addClass('hide');
            $_w.find('.docwriter_pages_wrapper').addClass('full readmode');
        }
    };

    var init_panels = function () {
        var $wrapper = $_w.find(".panels"),
            $parent = $wrapper.parent('.panel-wrapper'),
            $panels = $wrapper.find('.panel'),
            $buttons = $parent.find('.panel-switcher');

        var currpanelid = '#' + $panels.eq(currPanel).attr('id');

        if (typeof prevpanel === 'undefined') {
            prevpanel = currpanelid;
        }

        $buttons.each(function () {
            var $a = $(this);
            _m.leftClick('docwriter.panel.switch', $a, function (e) {
                e.preventDefault();
                e.stopPropagation();
                if ($a.hasClass('disable-switch')) {
                    return false;
                } else {
                    prevpanel = currpanelid;
                    update_panels($a.attr('href'));
                }
            });
        });

        update_panels(currpanelid);
    };

    var set_page_margin = function set_page_margin(side, size) {
        $_w.find('.docwriter_document_page').css('padding-' + side, size);
    };

    var set_page_contents = function set_page_contents(snapshot) {
        editor.revertToSnapshot(snapshot);
    };

    var get_page_margin = function get_page_margin(side) {
        if (typeof side === 'undefined') {
            return {
                top: $_w.find('.docwriter_document_page').css('padding-top'),
                right: $_w.find('.docwriter_document_page').css('padding-right'),
                bottom: $_w.find('.docwriter_document_page').css('padding-bottom'),
                left: $_w.find('.docwriter_document_page').css('padding-left')
            };
        } else {
            return $_w.find('.docwriter_document_page').css('padding-' + side);
        }
    };

    var get_page_contents = function get_page_contents(html) {
        var contents = {};
        if (html || (editor && editor.isEditing())) {
            contents = editor.history.snapshot();
            contents.selected = null;
        }
        else {
            contents = {"regions":{"docwriter_document":$(page_contents_element).html()},"selected":null};
        }
        return contents;
    };

    var get_page_properties = function get_page_properties(prop) {
        switch (prop) {
            case 'page_margin':
                return get_page_margin();

            default:
                return {
                    page_margin: get_page_margin()
                };
        }
    };

    var open_document = function open_document(path) {
        if (typeof path === 'undefined') {
            var opts = {
                startAt: _u.userDir('Documents'),
                parent_pid: this_process_name,
                parent_iid: _i
            };
            if (typeof file_info.internalPath != 'undefined') {
                opts.startAt = _f.dirname(file_info.internalPath);
            }
            new FlatOS.System.Application.FileSelectorDialog(opts, function (filepath) {
                if (editor === null) {
                    add_page();
                }
                file_info = new FlatOS.System.File().openFile(filepath);
                var doc = JSON.parse(file_info.contents);
                for (var side in doc.doc_properties.page_margin) {
                    set_page_margin(side, doc.doc_properties.page_margin[side]);
                }
                set_page_contents(doc.doc_contents);
                add_to_recents(file_info.externalPath);
                showFilePanel = false;
            });
        }
        else {
            _t.toggleWaiting();
            new FlatOS.Api.File(function (info) {
                file_info = info;
                if (editor === null) {
                    add_page();
                }
                var doc = JSON.parse(file_info.contents);
                for (var side in doc.doc_properties.page_margin) {
                    set_page_margin(side, doc.doc_properties.page_margin[side]);
                }
                set_page_contents(doc.doc_contents);
                add_to_recents(file_info.externalPath);
                showFilePanel = false;
                _t.toggleWaiting();
            }).openFile(path);
        }
    };

    var save_document = function save_document() {
        if (typeof file_info.internalPath === 'undefined') {
            var opts = {
                startAt: _u.userDir('Documents'),
                parent_pid: this_process_name,
                parent_iid: _i,
                withExt: ['docw'],
                contents: JSON.stringify(get_document()),
                ext: 'docw'
            };
            $(inspector._domSaving).removeClass('hide');
            new FlatOS.System.Application.FileSaverDialog(opts, function (isSaved, path) {
                if (isSaved) {
                    flashUI = new ContentTools.FlashUI('ok');
                    open_document(path);
                }
                else {
                    flashUI = new ContentTools.FlashUI('no');
                }
                $(inspector._domSaving).addClass('hide').find('.bar').width('0%');
            });
        }
        else {
            $(inspector._domSaving).removeClass('hide');
            new FlatOS.Api.File({
                callback: function (isSaved) {
                    if (isSaved) {
                        flashUI = new ContentTools.FlashUI('ok');
                    }
                    else {
                        flashUI = new ContentTools.FlashUI('no');
                    }
                    $(inspector._domSaving).addClass('hide');
                },
                progress: function (percentage) {
                    $(inspector._domSaving).find('.bar').width(percentage + '%');
                }
            }).save(file_info.internalPath, JSON.stringify(get_document()));
        }
    };

    var print_document = function () {
        if (editor && editor.isEditing()) {
            editor.stop(true);
        }
        var css = $('<style type="text/css" class="page_style" media="print" />');
        var margins_text = '';
        var margins = get_page_margin();
        for (var m in margins) {
            margins_text += margins[m] + ' ';
        }
        // TODO: Set the width and the height according to user's settings
        css.text('@page {size: portrait; margin: ' + margins_text + '}');
        $(window.frames["docwriter_print_frame_support"].document).find('head').find('.page_style').remove();
        $(window.frames["docwriter_print_frame_support"].document).find('head').append(css);
        window.frames["docwriter_print_frame_support"].document.body.innerHTML = $(page_contents_element).html();
        window.frames["docwriter_print_frame_support"].window.focus();
        window.frames["docwriter_print_frame_support"].window.print();
        editor.start();
    };

    var get_document = function () {
        return {
            doc_properties: get_page_properties(),
            doc_contents: get_page_contents()
        };
    };

    var init_autosave = function (interval) {
        interval = interval || (60000 * 5);
        autosave_interval = setInterval(function () {
            save_document();
        }, interval);
    };

    var update_tool = function (tool) {
        var element, selection;
        element = ContentEdit.Root.get().focused();
        if (!(element && element.isMounted())) {
            return false;
        }
        selection = null;
        if (element && element.selection) {
            selection = element.selection();
        }
        if (typeof tool === 'undefined') {
            for (tool in tools) {
                if (tool != 'updateInterval') {
                    update_tool(tool);
                }
            }
        } else {
            if (ContentTools.ToolShelf.fetch(tool).isApplied(element, selection)) {
                $_w.find('.action-' + tool).addClass('applied');
            } else {
                $_w.find('.action-' + tool).removeClass('applied');
            }
        }
    };

    var update_toolbox_ribbon = function () {
        var element = ContentEdit.Root.get().focused();
        if (!(element && element.isMounted())) {
            return false;
        }
        var type = element.type();
        $_w.find('li[data-toolbox-ribbon]').addClass('hide');
        if ($_w.find('li[data-toolbox-ribbon='+type+']').length > 0) {
            $_w.find('li[data-toolbox-ribbon='+type+']').removeClass('hide');
        }
        else {
            $_w.find('li[data-toolbox-ribbon]').addClass('hide').children('a').removeClass('active');
        }
        if ($_w.find('.panel-switcher.active').length === 0) {
            update_panels($_w.find('.panel_home').attr('href'));
        }
    };

    var load_file_panel = function () {
        load_samples(function (samples) {
            var $list = $_w.find('.mainviews').find('.sample-list').empty();
            for (var sample in samples) {
                var info = JSON.parse(_f.read(samples[sample] + '/info.json'));
                var $g4 = $('<div/>').addClass('g4');
                var $img = $('<img/>').addClass('sample-preview').attr('title', info.name);
                if (_f.exists(samples[sample] + '/preview.png')) {
                    $img.attr('src', _a.getURI() + '/samples/' + sample + '/preview.png');
                }
                else {
                    $img.attr('src', _a.getURI() + '/icon.svg');
                }
                _m.leftClick('docwriter.sample.load', $img, function () {
                    if (editor) {
                        _w.dialogConfirm({
                                title: 'Save this file ?',
                                content: 'Do you want to save the current file before create the new one ?',
                                ok: 'Yes',
                                cancel: 'No'
                            },
                            function (save) {
                                if (save) {
                                    save_document();
                                    destroy_page();
                                    var data = JSON.parse(_f.read(samples[sample] + '/sample.docw'));
                                    add_page();
                                    file_info = {};
                                    set_page_contents(data.doc_contents);
                                    showFilePanel = false;
                                }
                            }
                        );
                    }
                    else {
                        var data = JSON.parse(_f.read(samples[sample] + '/sample.docw'));
                        add_page();
                        set_page_contents(data.doc_contents);
                        showFilePanel = false;
                    }
                });
                $g4.append($img);
                $list.append($g4);
            }
        });

        if (user_config === null) {
            load_user_config();
        }
        $_w.find('.open_files').empty();
        for (var i = 0, l = user_config.lastOpened.length; i < l; ++i) {
            var $g4 = $('<div/>').addClass('open_file').attr('data-external-path', user_config.lastOpened[i]);
            var $img = $('<img/>').attr('src', _a.getURI() + '/icon.svg').css({
                'float': 'left',
                'width': '32px'
            });
            var $span = $('<span/>').text(user_config.lastOpened[i]);
            $g4.append($img);
            $g4.append($span);
            $g4.appendTo($_w.find('.open_files'));
            _m.leftClick('docwriter.document.open', $g4, function () {
                var path = $(this).attr('data-external-path');
                open_document(path);
            });
        }
    };

    _w.on('init', function () {
        init_docwriter();

        load_file_panel();

        var $wrapper = $_w.find(".panels"),
            $parent = $wrapper.parent('.panel-wrapper'),
            $panels = $wrapper.find('.panel'),
            $buttons = $parent.find('.panel-switcher');

        $buttons.each(function () {
            $(this).attr('href', $(this).attr('href') + _i);
        });
        $panels.each(function () {
            $(this).attr('id', $(this).attr('id') + _i);
        });

        init_panels();
        init_views();

        _m.leftClick('docwriter.document.explore', $_w.find('.open_folder.explore'), function () {
            new FlatOS.System.Application.FileSelectorDialog({
                startAt: _u.userDir('Documents'),
                parent_pid: this_process_name,
                parent_iid: _i,
                withExt: ['docw'],
                title: "Choose a document"
            }, open_document);
        });

        _m.leftClick('docwriter.panels.files.show', $_w.find('.panel_file'), function () {
            load_file_panel();
            showFilePanel = true;
        });

        _m.leftClick('docwriter.panels.files.hide', $_w.find('.panel-file').find('.back_icon'), function () {
            if (editor) {
                showFilePanel = false;
            }
        });

        $(['undo', 'redo']).each(function () {
            var action = this.toString();
            _m.leftClick('docwriter.stack.' + action, $_w.find('.action-' + action), function () {
                var element, selection;
                element = ContentEdit.Root.get().focused();
                if (!(element && element.isMounted())) {
                    return false;
                }
                selection = null;
                if (element && element.selection) {
                    selection = element.selection();
                }
                ContentTools.ToolShelf.fetch(action).apply(element, selection, function (success) { });
            });
        });

        $(['unordered-list', 'ordered-list']).each(function () {
            var el = this.toString();
            _m.buttonDown('docwriter.show.dropdown', $_w.find('.dropdown-' + el), function () {
                var $el = $_w.find('.action-' + el);
                var el_offset = $el.offset();
                el_offset.top += $el.height();
                el_offset.left += $el.width();
                $_w.find('.docwriter_dropdown').hide(0);
                $_w.find('.docwriter_dropdown_' + el)
                    .show(0)
                    .offset(el_offset);
            });
            _m.buttonUp('docwriter.show.dropdown', $_w.find('.dropdown-' + el), function () {
                _m.buttonDownOnce('docwriter.hide.dropdown', $(document), function () {
                    $_w.find('.docwriter_dropdown_' + el).hide(0);
                });
            });
        });

        $(['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'align-left',
            'align-center', 'align-right', 'align-justify', 'indent', 'unindent', 'paragraph', 'heading',
            'subheading', 'preformatted', 'blockquote', 'unordered-list', 'ordered-list']).each(function () {
            var action = this.toString();

            tools[action] = new ContentTools.ToolUI(ContentTools.ToolShelf.fetch(action));

            _m.leftClick('docwriter.text.modifier', $_w.find('.action-' + action), function () {
                var element, selection;
                element = ContentEdit.Root.get().focused();
                if (!(element && element.isMounted())) {
                    return false;
                }
                selection = null;
                if (element && element.selection) {
                    selection = element.selection();
                }
                tools[action].apply(element, selection);
            });
        });

        $(['ol', 'ul']).each(function () {
            var el = this.toString();

            _m.buttonDown('docwriter.list.style', $_w.find('.action-' + el), function () {
                var element;
                element = ContentEdit.Root.get().focused();
                if (!(element && element.isMounted())) {
                    return false;
                }
                if (element.type() === 'ListItemText') {
                    var list = element.parent().parent()._domElement;

                    if (list.tagName.toLowerCase() !== el) {
                        (el === 'ul') ? tools['unordered-list'].apply(element) : tools['ordered-list'].apply(element);
                        _m.triggerButtonDown('docwriter.list.style', $(this));
                    }
                    $_w.find('.action-' + el).each(function () {
                        $(list).removeClass($(this).attr('data-style'));
                    });
                    $(list).addClass($(this).attr('data-style'));
                }
                else {
                    (el === 'ul') ? tools['unordered-list'].apply(element) : tools['ordered-list'].apply(element);
                    _m.triggerButtonDown('docwriter.list.style', $(this));
                }
            });
        });

        _m.leftClick('docwriter.text.modifier', $_w.find('.action-unformat'), function () {
                var element, selection;
                element = ContentEdit.Root.get().focused();
                if (!(element && element.isMounted())) {
                    return false;
                }
                selection = null;
                if (element && element.selection) {
                    selection = element.selection();
                }
                new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('unformat')).apply(element, selection);
        });

        _m.leftClick('docwriter.text.size', $_w.find('.action-size_up'), function () {
            var element, selection;
            element = ContentEdit.Root.get().focused();
            if (!(element && element.isMounted())) {
                return false;
            }
            selection = null;
            if (element && element.selection) {
                selection = element.selection();
            }
            new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('fontsizeup')).apply(element, selection);
            // var el = editor.getSelectedParentElement();

            // if (el.nodeName.toLowerCase() === 'font' && $(el).hasClass('font-size')) {
            //     var size = parseInt($(el).css('font-size')) + 2;
            //     $(el).attr('style', 'font-size:' + size + 'px');
            // }
            // else {
            //     var font_s = parseInt($(page).css('font-size')) + 2;
            //     editor.execAction('fontSize', { value: font_s });
            //     var parent = editor.getSelectedParentElement();
            //     $(parent)
            //         .addClass('font-size')
            //         .removeAttr('size')
            //         .attr('style', 'font-size:' + font_s + 'px');
            // }
        });

        _m.leftClick('docwriter.text.size', $_w.find('.action-size_down'), function () {
            var element, selection;
            element = ContentEdit.Root.get().focused();
            if (!(element && element.isMounted())) {
                return false;
            }
            selection = null;
            if (element && element.selection) {
                selection = element.selection();
            }
            new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('fontsizedown')).apply(element, selection);
            // var el = editor.getSelectedParentElement();

            // if (el.nodeName.toLowerCase() === 'font' && $(el).hasClass('font-size')) {
            //     var size = parseInt($(el).css('font-size')) - 2;
            //     size = (size > 8) ? size : 8;
            //     $(el).attr('style', 'font-size:' + size + 'px');
            // }
            // else {
            //     var font_s = parseInt($(page).css('font-size')) - 2;
            //     font_s = (font_s > 8) ? font_s : 8;
            //     editor.execAction('fontSize', { value: font_s });
            //     var parent = editor.getSelectedParentElement();
            //     $(parent)
            //         .addClass('font-size')
            //         .removeAttr('size')
            //         .attr('style', 'font-size:' + font_s + 'px');
            // }
        });

        _m.leftClick('docwriter.image.insert', $_w.find('.action-insert_image'), function () {
            var element = ContentEdit.Root.get().focused();

            var opts = {
                startAt: _u.userDir('Pictures'),
                parent_pid: this_process_name,
                parent_iid: _i,
                withExt: ['jpg', 'jpeg', 'bmp', 'gif', 'png']
            };
            new FlatOS.System.Application.FileSelectorDialog(opts, function (path) {
                var image = new Image();
                var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
                var context = canvas.getContext('2d');

                context.save();

                imageDialog = new ContentTools.ImageDialog();
                modal = new ContentTools.ModalUI();

                editor.attach(modal);
                editor.attach(imageDialog);

                imageDialog.addEventListener('cancel', (function () {
                    return function () {
                        modal.hide();
                        imageDialog.hide();
                        return false;
                    };
                })());

                imageDialog.mount();

                imageDialog.addEventListener('imageuploader.clear', (function () {
                    return function () {
                        modal.hide();
                        imageDialog.hide();
                        new FlatOS.System.Application.ConfirmDialog({
                            parent_pid: this_process_name,
                            parent_iid: _i,
                            title: 'Choose another picture ?',
                            content: 'Do you want to choose another picture ?',
                            ok: 'Yes',
                            cancel: 'No, just close this popup'
                        }, function (choice) {
                            if (choice) {
                                $_w.find('.action-insert_image').trigger('click.docwriter.insert.image');
                            }
                        });
                    };
                })());

                image.onload = function () {
                    canvas.height = image.height;
                    canvas.width = image.width;
                    context.drawImage(image, 0, 0, image.width, image.height, 0, 0, image.width, image.height);
                    var url = canvas.toDataURL('image/jpeg');

                    imageDialog.populate(url, [image.width, image.height]);

                    imageDialog.addEventListener('imageuploader.rotatecw', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.width;
                                canvas.width = ctx.height;

                                context.restore();
                                context.translate(canvas.width, 0);
                                context.rotate((Math.PI / 180) * 90);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.rotateccw', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.width;
                                canvas.width = ctx.height;

                                context.restore();
                                context.translate(0, canvas.height);
                                context.rotate((Math.PI / 180) * -90);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.flipvertical', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.height;
                                canvas.width = ctx.width;

                                context.restore();
                                context.scale(-1, 1);
                                context.translate(-canvas.width, 0);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.fliphorizontal', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.height;
                                canvas.width = ctx.width;

                                context.restore();
                                context.scale(1, -1);
                                context.translate(0, -canvas.height);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.save', (function (_this) {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                var crop_region = imageDialog.cropRegion();

                                var sX = crop_region[1] * ctx.width;
                                var sY = crop_region[0] * ctx.height;
                                var sW = (crop_region[3] - crop_region[1]) * ctx.width;
                                var sH = (crop_region[2] - crop_region[0]) * ctx.height;

                                context.restore();
                                canvas.height = sH;
                                canvas.width = sW;
                                context.drawImage(ctx, sX, sY, sW, sH, 0, 0, sW, sH);

                                var img,
                                    imageAttrs = {},
                                    index, node, _ref;

                                imageAttrs.height = sH;
                                imageAttrs.src = canvas.toDataURL('image/jpeg');
                                imageAttrs.width = sW;
                                imageAttrs['data-ce-max-width'] = $(page_contents_element).width();
                                imageAttrs['data-original-size'] = ctx.width + ',' + ctx.height;
                                imageAttrs['data-original-image'] = ctx.src;

                                img = new ContentEdit.Image(imageAttrs);
                                _ref = _this._insertAt(element);
                                node = _ref[0];
                                index = _ref[1];

                                node.parent().attach(img, index);
                                img.focus();

                                modal.hide();
                                imageDialog.hide();
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');

                            return true;
                        };
                    })(ContentTools.Tool));

                    modal.show();
                    imageDialog.show();
                };

                image.src = _f.toFileSystemPath(path);
            });
        });

        _m.leftClick('docwriter.image.replace', $_w.find('.action-replace_image'), function () {
            var element, selection;
            element = ContentEdit.Root.get().focused();

            var opts = {
                startAt: _u.userDir('Pictures'),
                parent_pid: this_process_name,
                parent_iid: _i,
                withExt: ['jpg', 'jpeg', 'bmp', 'gif', 'png']
            };
            new FlatOS.System.Application.FileSelectorDialog(opts, function (path) {
                var image = new Image();

                var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
                var context = canvas.getContext('2d');

                context.save();

                imageDialog = new ContentTools.ImageDialog();
                modal = new ContentTools.ModalUI();

                editor.attach(modal);
                editor.attach(imageDialog);

                imageDialog.addEventListener('cancel', (function () {
                    return function () {
                        modal.hide();
                        imageDialog.hide();
                        return false;
                    };
                })());

                imageDialog.mount();
                imageDialog.caption('Update Image');
                imageDialog._domInsert.textContent = 'OK';
                imageDialog._domClear.textContent = 'Cancel';

                imageDialog.addEventListener('imageuploader.clear', (function () {
                    return function () {
                        modal.hide();
                        imageDialog.hide();
                        return false;
                    };
                })());

                image.onload = function () {
                    canvas.height = image.height;
                    canvas.width = image.width;
                    context.drawImage(image, 0, 0, image.width, image.height, 0, 0, image.width, image.height);

                    imageDialog.populate(image.src, [image.width, image.height]);

                    imageDialog.addEventListener('imageuploader.rotatecw', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.width;
                                canvas.width = ctx.height;

                                context.restore();
                                context.translate(canvas.width, 0);
                                context.rotate((Math.PI / 180) * 90);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.rotateccw', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.width;
                                canvas.width = ctx.height;

                                context.restore();
                                context.translate(0, canvas.height);
                                context.rotate((Math.PI / 180) * -90);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.flipvertical', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.height;
                                canvas.width = ctx.width;

                                context.restore();
                                context.scale(-1, 1);
                                context.translate(-canvas.width, 0);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.fliphorizontal', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                canvas.height = ctx.height;
                                canvas.width = ctx.width;

                                context.restore();
                                context.scale(1, -1);
                                context.translate(0, -canvas.height);
                                context.drawImage(ctx, 0, 0);

                                var temp = new Image();
                                temp.onload = function () {
                                    imageDialog.populate(temp.src, [temp.width, temp.height]);
                                };

                                temp.src = canvas.toDataURL('image/jpeg');
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');
                        };
                    })());

                    imageDialog.addEventListener('imageuploader.save', (function () {
                        return function () {
                            var ctx = new Image();

                            ctx.onload = function () {
                                var crop_region = imageDialog.cropRegion();

                                var sX = crop_region[1] * ctx.width;
                                var sY = crop_region[0] * ctx.height;
                                var sW = (crop_region[3] - crop_region[1]) * ctx.width;
                                var sH = (crop_region[2] - crop_region[0]) * ctx.height;

                                context.restore();
                                canvas.height = sH;
                                canvas.width = sW;
                                context.drawImage(ctx, sX, sY, sW, sH, 0, 0, sW, sH);

                                element.unmount();
                                element.attr('src', canvas.toDataURL('image/jpeg'));
                                element.attr('width', sW);
                                element.attr('height', sH);
                                element.attr('data-original-size', ctx.width + ',' + ctx.height);
                                element.attr('data-original-image', ctx.src);
                                element.size([sW, sH]);
                                element._aspectRatio = sH / sW;
                                element.mount();
                                modal.hide();
                                imageDialog.hide();
                                element.focus();
                            };

                            ctx.src = canvas.toDataURL('image/jpeg');

                            return true;
                        };
                    })());

                    modal.show();
                    imageDialog.show();
                };

                image.src = _f.toFileSystemPath(path);
            });
        });

        _m.leftClick('docwriter.image.reset', $_w.find('.action-reset_image'), function () {
            var element;
            element = ContentEdit.Root.get().focused();
            // TODO: Add style classes here...
            ['align-left', 'align-right'].forEach(function (className) {
                element.removeCSSClass(className);
            });
            var src = element.attr('data-original-image');
            var sizes = element.attr('data-original-size').split(',').map(function (s) {
                return parseInt(s);
            });
            var r = sizes[1] / sizes[0];
            var w = $(page_contents_element).width() - 1;
            var h = w * r;

            element.unmount();
            element.attr('src', src);
            element.size([w, h]);
            element._aspectRatio = r;
            element.mount();
        });

        _m.leftClick('docwriter.image.crop', $_w.find('.action-crop_image'), function () {
            var element;
            element = ContentEdit.Root.get().focused();

            var image = new Image();

            var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
            var context = canvas.getContext('2d');

            context.save();

            imageDialog = new ContentTools.ImageDialog();
            modal = new ContentTools.ModalUI();

            editor.attach(modal);
            editor.attach(imageDialog);

            imageDialog.addEventListener('cancel', (function () {
                return function () {
                    modal.hide();
                    imageDialog.hide();
                    return false;
                };
            })());

            imageDialog.mount();
            imageDialog.caption('Crop Image');
            $(imageDialog._domControls).children('.ct-control-group--left').remove();
            imageDialog._domInsert.textContent = 'Crop';
            imageDialog._domClear.textContent = 'Cancel';

            imageDialog.addEventListener('imageuploader.clear', (function () {
                return function () {
                    modal.hide();
                    imageDialog.hide();
                    return false;
                };
            })());

            image.onload = function () {
                canvas.height = image.height;
                canvas.width = image.width;
                context.drawImage(image, 0, 0, image.width, image.height, 0, 0, image.width, image.height);

                imageDialog.populate(image.src, [image.width, image.height]);
                imageDialog.addCropMarks();

                imageDialog.addEventListener('imageuploader.save', (function () {
                    return function () {
                        var ctx = new Image();

                        ctx.onload = function () {
                            var crop_region = imageDialog.cropRegion();

                            var sX = crop_region[1] * ctx.width;
                            var sY = crop_region[0] * ctx.height;
                            var sW = (crop_region[3] - crop_region[1]) * ctx.width;
                            var sH = (crop_region[2] - crop_region[0]) * ctx.height;

                            context.restore();
                            canvas.height = sH;
                            canvas.width = sW;
                            context.drawImage(ctx, sX, sY, sW, sH, 0, 0, sW, sH);

                            var sizes = element.size();
                            var r = sH / sW;
                            var w = sizes[0];
                            var h = w * r;

                            element.unmount();
                            element.attr('src', canvas.toDataURL('image/jpeg'));
                            element.attr('width', w);
                            element.attr('height', h);
                            element.size([w, h]);
                            element._aspectRatio = r;
                            element.mount();
                            modal.hide();
                            imageDialog.hide();
                            element.focus();
                        };

                        ctx.src = canvas.toDataURL('image/jpeg');

                        return true;
                    };
                })());

                modal.show();
                imageDialog.show();
            };

            image.src = element.attr('src');
        });

        _m.leftClick('docwriter.image.rl', $_w.find('.action-rl_image'), function () {
            var element;
            element = ContentEdit.Root.get().focused();

            var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
            var context = canvas.getContext('2d');
            var ctx = new Image();

            ctx.onload = function () {
                canvas.height = ctx.width;
                canvas.width = ctx.height;

                context.restore();
                context.translate(0, canvas.height);
                context.rotate((Math.PI / 180) * -90);
                context.drawImage(ctx, 0, 0);

                var temp = new Image();
                temp.onload = function () {
                    var sizes = element.size();
                    element.unmount();
                    element.attr('src', temp.src);
                    element.size([sizes[1], sizes[0]]);
                    element._aspectRatio = temp.width / temp.height;
                    element.mount();
                };

                temp.src = canvas.toDataURL('image/jpeg');
            };

            ctx.src = element.attr('src');
        });

        _m.leftClick('docwriter.image.rr', $_w.find('.action-rr_image'), function () {
            var element;
            element = ContentEdit.Root.get().focused();

            var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
            var context = canvas.getContext('2d');
            var ctx = new Image();

            ctx.onload = function () {
                canvas.height = ctx.width;
                canvas.width = ctx.height;

                context.restore();
                context.translate(canvas.width, 0);
                context.rotate((Math.PI / 180) * 90);
                context.drawImage(ctx, 0, 0);

                var temp = new Image();
                temp.onload = function () {
                    var sizes = element.size();
                    element.unmount();
                    element.attr('src', temp.src);
                    element.size([sizes[1], sizes[0]]);
                    element._aspectRatio = temp.width / temp.height;
                    element.mount();
                };

                temp.src = canvas.toDataURL('image/jpeg');
            };

            ctx.src = element.attr('src');
        });

        _m.leftClick('docwriter.image.fv', $_w.find('.action-fv_image'), function () {
            var element;
            element = ContentEdit.Root.get().focused();

            var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
            var context = canvas.getContext('2d');
            var ctx = new Image();

            ctx.onload = function () {
                canvas.height = ctx.height;
                canvas.width = ctx.width;

                context.restore();
                context.scale(-1, 1);
                context.translate(-canvas.width, 0);
                context.drawImage(ctx, 0, 0);

                var temp = new Image();
                temp.onload = function () {
                    var sizes = element.size();
                    element.unmount();
                    element.attr('src', temp.src);
                    element.size([sizes[0], sizes[1]]);
                    element.mount();
                };

                temp.src = canvas.toDataURL('image/jpeg');
            };

            ctx.src = element.attr('src');
        });

        _m.leftClick('docwriter.image.fh', $_w.find('.action-fh_image'), function () {
            var element;
            element = ContentEdit.Root.get().focused();

            var canvas = $_w.find('canvas.docwriter_insert_image_support').get(0);
            var context = canvas.getContext('2d');
            var ctx = new Image();

            ctx.onload = function () {
                canvas.height = ctx.height;
                canvas.width = ctx.width;

                context.restore();
                context.scale(1, -1);
                context.translate(0, -canvas.height);
                context.drawImage(ctx, 0, 0);

                var temp = new Image();
                temp.onload = function () {
                    var sizes = element.size();
                    element.unmount();
                    element.attr('src', temp.src);
                    element.size([sizes[0], sizes[1]]);
                    element.mount();
                };

                temp.src = canvas.toDataURL('image/jpeg');
            };

            ctx.src = element.attr('src');
        });

        _m.leftClick('docwriter.image.delete', $_w.find('.action-delete_image'), function () {
            var element, selection;
            element = ContentEdit.Root.get().focused();
            if (!(element && element.isMounted())) {
                return false;
            }
            selection = null;
            if (element && element.selection) {
                selection = element.selection();
            }
            new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('remove')).apply(element, selection);
            editor.regions().docwriter_document.children[0].focus();
        });

        _m.leftClick('docwriter.insert.table', $_w.find('.action-insert_table'), function () {
            var _adjustColumns = function (section, columns) {
                var cell, cellTag, cellText, currentColumns, diff, i, row, _i, _len, _ref, _results;
                _ref = section.children;
                _results = [];
                for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                    row = _ref[_i];
                    cellTag = row.children[0].tagName();
                    currentColumns = row.children.length;
                    diff = columns - currentColumns;
                    if (diff < 0) {
                        _results.push((function () {
                            var _j, _results1;
                            _results1 = [];
                            for (i = _j = diff; diff <= 0 ? _j < 0 : _j > 0; i = diff <= 0 ? ++_j : --_j) {
                                cell = row.children[row.children.length - 1];
                                _results1.push(row.detach(cell));
                            }
                            return _results1;
                        })());
                    }
                    else if (diff > 0) {
                        _results.push((function () {
                            var _j, _results1;
                            _results1 = [];
                            for (i = _j = 0; 0 <= diff ? _j < diff : _j > diff; i = 0 <= diff ? ++_j : --_j) {
                                cell = new ContentEdit.TableCell(cellTag);
                                row.attach(cell);
                                cellText = new ContentEdit.TableCellText('');
                                _results1.push(cell.attach(cellText));
                            }
                            return _results1;
                        })());
                    }
                    else {
                        _results.push(void 0);
                    }
                }
                return _results;
            };

            var _createTable = function (tableCfg) {
                var body, foot, head, table;
                table = new ContentEdit.Table();
                if (tableCfg.head) {
                    head = _createTableSection('thead', 'th', tableCfg.columns);
                    table.attach(head);
                }
                body = _createTableSection('tbody', 'td', tableCfg.columns);
                table.attach(body);
                if (tableCfg.foot) {
                    foot = _createTableSection('tfoot', 'td', tableCfg.columns);
                    table.attach(foot);
                }
                return table;
            };

            var _createTableSection = function (sectionTag, cellTag, columns) {
                var cell, cellText, i, row, section, _i;
                section = new ContentEdit.TableSection(sectionTag);
                row = new ContentEdit.TableRow();
                section.attach(row);
                for (i = _i = 0; 0 <= columns ? _i < columns : _i > columns; i = 0 <= columns ? ++_i : --_i) {
                    cell = new ContentEdit.TableCell(cellTag);
                    row.attach(cell);
                    cellText = new ContentEdit.TableCellText('');
                    cell.attach(cellText);
                }
                return section;
            };

            var _updateTable = function (tableCfg, table) {
                var columns, foot, head, section, _i, _len, _ref;
                if (!tableCfg.head && table.thead()) {
                    table.detach(table.thead());
                }
                if (!tableCfg.foot && table.tfoot()) {
                    table.detach(table.tfoot());
                }
                columns = table.firstSection().children[0].children.length;
                if (tableCfg.columns !== columns) {
                    _ref = table.children;
                    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                        section = _ref[_i];
                        _adjustColumns(section, tableCfg.columns);
                    }
                }
                if (tableCfg.head && !table.thead()) {
                    head = _createTableSection('thead', 'th', tableCfg.columns);
                    table.attach(head);
                }
                if (tableCfg.foot && !table.tfoot()) {
                    foot = _createTableSection('tfoot', 'td', tableCfg.columns);
                    return table.attach(foot);
                }
            };

            var element;
            element = ContentEdit.Root.get().focused();
            if (!(element && element.isMounted())) {
                return false;
            }

            tableDialog = new ContentTools.TableDialog();
            modal = new ContentTools.ModalUI();

            editor.attach(modal);
            editor.attach(tableDialog);

            tableDialog.addEventListener('cancel', (function () {
                return function () {
                    modal.hide();
                    tableDialog.hide();
                    return false;
                };
            })());

            tableDialog.addEventListener('save', (function (_this) {
                return function (ev) {
                    var index, node, tableCfg, _ref;
                    tableCfg = ev.detail();
                    table = _createTable(tableCfg);
                    _ref = _this._insertAt(element);
                    node = _ref[0];
                    index = _ref[1];
                    node.parent().attach(table, index);
                    p = new ContentEdit.Text('p');
                    node.parent().attach(p, index+1);
                    table.firstSection().children[0].children[0].children[0].focus();
                    modal.hide();
                    tableDialog.hide();
                    return true;
                };
            })(ContentTools.Tool));

            tableDialog.mount();

            tableDialog.show();
            modal.show();
        });

        _m.leftClick('docwriter.insert.video', $_w.find('.action-insert_video'), function () {
            var element, selection;
            element = ContentEdit.Root.get().focused();
            if (!(element && element.isMounted())) {
                return false;
            }
            selection = null;
            if (element && element.selection) {
                selection = element.selection();
            }
            ContentTools.ToolShelf.fetch('video').apply(element, selection, function (success) {});
        });

        _m.leftClick('docwriter.document.save', $_w.find('.action-save'), function () {
            save_document();
        });

        _m.leftClick('docwriter.document.print', $_w.find('.action-print'), function () {
            print_document();
        });

        _w.addShortcut('Ctrl+S', function () {
            save_document();
        });

        // init_autosave(5000);

        for (var action in tools) {
            tools[action].addEventListener('applied', (function (u, a) {
                return function () {
                    u(a);
                };
            })(update_tool, action));
        }

    });

    _w.on('focus', function () {
        if (editor && editor.isEditing()) {
            var elements = editor.regions().docwriter_document.children;
            var element = ContentEdit.Root.get().focused();
            if (!(element && element.isMounted())) {
                elements[elements.length - 1].focus();
            }
        }
    });

    _w.on('update', function () {
        update_tool();
        update_toolbox_ribbon();
        update_panels_sizes();
        update_page_margin();
        update_file_panel_visibility();
        update_panels_visibility();
    });

    _w.on('close', function () {
        if (editor) {
            editor.destroy();
            clearInterval(autosave_interval);
        }
    });

    _w.on('resizing', (function (u) {
        return function () {
            u();
        };
    })(update_panels_sizes));

    _a.registerCommand('checkfile', (function (_f) {
        return function (path) {
            var info = _f.openFile(path);
            // TODO: Add DocWriter extensions here
            info.contents = $.parseJSON(info.contents);
            if (info.extension === 'docw') {
                if (info.contents.hasOwnProperty("doc_properties") && info.contents.hasOwnProperty("doc_contents")) {
                    if (info.contents.doc_properties.hasOwnProperty("page_margin") &&
                        info.contents.doc_contents.hasOwnProperty("regions") &&
                        info.contents.doc_contents.hasOwnProperty("selected")) {
                        return true;
                    }
                }
            }
            return false;
        };
    })(new FlatOS.System.File()));

    _a.registerCommand('open', (function (o, w) {
        return function (path) {
            o(path);
            w.find('.panel-file').addClass('hide');
        };
    })(open_document, $_w));

})(jQuery);
