/**
 *	kbaseModelEditor.js (kbaseModelEditor)
 *
 *	Given a pair of workspace and media object names or ids,
 *	produce editable model tables.
 *
 * Authors:
 * 	 nconrad@mcs.anl.gov
 *
 */

(function( $, undefined ) {

'use strict';

$.KBWidget({
    name: "kbaseModelEditor",
    parent: "kbaseAuthenticatedWidget",
    version: "1.0.0",
    options: {},
    init: function(input) {

        this._super(input);
        var self = this,
            container = $('<div class="kb-editor">');

        self.$elem.append(container);

        // api
        var modeling = new KBModeling( self.authToken() ),
            kbapi = modeling.kbapi,
            biochem = modeling.biochem,
            getCpds = modeling.getCpds;

        // accept either workspace/object names or workspace/object ids
        var wsName = input.ws,
            objName = input.obj;

        if (isNaN(wsName) && isNaN(objName) )
            var param = {workspace: wsName, name: objName};
        else if (!isNaN(wsName) && !isNaN(objName) )
            var param = {ref: wsName+'/'+objName};
        else
            console.error('kbaseMediaEditor arguements are invalid');

        var table,          // main table to be edited (reactions for now)
            modelObj,
            model,          // actual model data
            modelreactions, // edited table
            rawData,        // raw workspace object
            tabs;           // UI tabs


        // some controls for the table
        var saveBtn = $('<button class="btn btn-primary btn-save pull-right hide">'+
                        'Save</button>');
        var saveAsBtn = $('<button class="btn btn-primary btn-save pull-right hide">'+
                        'Save as...</button>');
        var addBtn = $('<button class="btn btn-primary pull-right">'+
                       '<i class="fa fa-plus"></i> Add compounds...</button>');
        var rmBtn = $('<button class="btn btn-danger pull-right hide">');

        // keep track of edits
        var _editHistory = new EditHistory();

        // get media data
        kbapi('ws', 'get_objects', [param])
            .done(function(res){
                rawData = $.extend(true, {}, res[0]);
                console.log('raw model data', rawData)

                modelObj = new modeling['KBaseFBA_FBAModel'](self);
                modelObj.setMetadata(res[0].info);
                modelObj.setData(res[0].data);
                model = modelObj.data;

                // table being edited
                modelreactions = model.modelreactions;

                console.log('model', model)
                console.log('modelObj', modelObj)

                // skip overview
                var tabList = modelObj.tabList.slice(1);

                var uiTabs = [];

                var i = tabList.length;
                while (i--) {
                    var tab = tabList[i];

                    // skip viz not needed
                    if (['Genes', 'Pathways', 'Gapfilling'].indexOf(tab.name) !== -1) {
                        tabList.splice(i,1);
                        continue;
                    }

                    // add loading status
                    var placeholder = $('<div>')
                    placeholder.loading();

                    uiTabs.unshift({name: tabList[i].name, content: placeholder});
                }

                uiTabs[0].active = true;
                tabs = container.kbTabs({tabs: uiTabs});

                buildContent(modelObj.tabList)

                console.log('raw model data', rawData)
            })


        function buildContent(tabList) {

            //5) Iterates over the entries in the spec and instantiate things
            for (var i = 0; i < tabList.length; i++) {
                var tabSpec = tabList[i];
                var tabPane = tabs.tabContent(tabSpec.name);

                // skip any vertical tables for now
                if (tabSpec.type == 'verticaltbl') continue;

                if (tabSpec.name === 'Reactions')
                    createRxnTable(tabSpec, tabPane)
                else
                    createDataTable(tabSpec, tabPane);
            }
        }

        function createDataTable(tabSpec, tabPane) {
            var settings = getTableSettings(tabSpec, model);
            tabPane.rmLoading();

            // the 'style' here is a hack for narrative styling :/
            var table = $('<table class="table table-bordered table-striped kb-media-editor" style="margin-left: auto; margin-right: auto;">')
            tabPane.append(table);
            var table = table.DataTable(settings);
        }


        // creates a datatable on a tabPane
        function createRxnTable(tabSpec, tabPane) {
            var settings = getTableSettings(tabSpec, model);
            tabPane.rmLoading();

            // the 'style' here is a hack for narrative styling :/
            table = $('<table class="table table-bordered table-striped kb-media-editor" style="margin-left: auto; margin-right: auto;">')
            tabPane.append(table);
            table = table.DataTable(settings);

            // add controls
            var controls = tabPane.find('.controls');

            controls.append(saveAsBtn);
            controls.append(saveBtn);
            controls.append(addBtn);
            controls.append(rmBtn);

            addBtn.on('click', cpdModal);
            saveBtn.on('click', function() { saveData(getTableData(), wsName, objName) });
            saveAsBtn.on('click', saveModal);
            rmBtn.on('click', function() {
                // get all selected data
                var data = getTableData('.row-select');

                // edit table
                var op = {op: 'rm', data: data};
                editTable(op);
                modeling.notice(container, 'Removed '+data.length+' compounds')

                rmBtn.toggleClass('hide');
                addBtn.toggleClass('hide');
            })

            // event for clicking on table row
            table.on('click', 'tbody tr td:first-child', function() {
                $(this).parent().toggleClass('row-select');

                var count = table.rows('.row-select').data().length;

                if (count > 0){
                    addBtn.addClass('hide');
                    rmBtn.html('<i class="fa fa-minus"></i> '+
                        'Remove '+count+' compounds')
                    rmBtn.removeClass('hide');
                } else {
                    rmBtn.addClass('hide');
                    addBtn.removeClass('hide');
                }
            });

            // event for clickingon editable cells
            table.on('click', '.editable', function(e) {
                //if (table.cell(this).data().indexOf('=') !== -1) {
                    //table.cells(this).data().draw()
                //} else {
                    $(this).attr('contenteditable', true);
                    $(this).addClass('editing-focus');
                    $(this).focus();
                //}
            })

            table.on('blur', 'td.editable', function(){
                var before = table.cell(this).data(),
                    after = $(this).text();

                // fixme: add better validation and error handling
                if (before === after) return;

                // set data in datable memory
                table.cell( this ).data(after).draw()

                // save in history
                var op = {op: 'modify', before: before, after: after};
                editTable(op)
            })

            // emit blur on enter as well
            table.on('keydown', 'td.editable', function(e) {
                if(e.keyCode == 13) {
                    e.preventDefault();
                    $(this).blur();
                }
            })

        }

        // takes table spec and prepared data, returns datatables settings object
        function getTableSettings(tab, data) {
            var tableColumns = getColSettings(tab);

            return {
                dom: '<"top col-sm-6 controls"l><"top col-sm-6"f>rt<"bottom"ip><"clear">',
                data: modelObj[tab.key],
                columns: tableColumns,
                order: [[ 1, "asc" ]],
                language: {
                    search: "_INPUT_",
                    searchPlaceholder: 'Search '+tab.name
                }
            };
        }

        // takes table spec, returns datatables column settings
        function getColSettings(tab) {
            var settings = [];
            var cols = tab.columns;

            // add checkbox
            if (tab.name == 'Reactions') {
                settings.push({
                    orderable: false,
                    data: function(row) {
                        return '<i class="fa fa-square-o"></i>';
                    }
                })
            }

            for (var i=0; i<cols.length; i++) {
                var col = cols[i];
                var key = col.key,
                    type = col.type,
                    format = col.linkformat,
                    method = col.method,
                    action = col.action

                var config = {
                    title: col.label,
                    name: col.label,
                    defaultContent: '-',
                }

                if (['equation', 'genes'].indexOf(key) !== -1)
                    config.className = 'editable';

                if ( key === 'genes' ) { // fixme: need not depend on spec
                    config.data = function(row) {
                        var items = []
                        for (var i=0; i<row.genes.length; i++) {
                            items.push(row.genes[i].id);
                        }
                        return items.join('<br>');
                    }
                } else {
                    config.data = key;
                }

                if (col.width) config.width = col.width;

                settings.push(config)
            }


            return settings
        }


        // takes media data, adds id key/value, and sorts it.
        function sanitizeMedia(media) {
            var i = media.length;
            while (i--) {
                media[i].id = media[i].compound_ref.split('/').pop();
            }
            return media.sort(function(a, b) {
                if (a.id < b.id) return -1;
                if (a.id > b.id) return 1;
                return 0;
            })
        }

        function getCpdIds(media) {
            var ids = [];
            for (var i=0; i<media.length; i++) {
                ids.push(media[i].id )
            }
            return ids;
        }


        function cpdModal() {
            var table = $('<table class="table table-bordered table-striped kb-media-editor'+
                ' " style="width: 100% !important;">');

            var modal = $('<div>').kbaseModal({
                title: 'Add Reactions',
                subText: 'Select compounds below, then click "add".',
                body: table
            })

            var table = table.DataTable({
                processing: true,
                serverSide: true,
                orderMulti: false,
                order: [[ 1, "asc" ]],
                ajax: function (opts, callback, settings) {
                    biochem('reactions', opts,
                    ['id', 'name', 'definition']
                    ).done(function(res){
                        var data = {
                            data: res.docs,
                            recordsFiltered: res.numFound,
                            recordsTotal: 27693
                        }
                        callback(data);
                    })
                },
                dom: '<"top col-sm-6 controls"l><"top col-sm-6"f>rt<"bottom"ip><"clear">',
                columns: [
                    { orderable: false, data: function(row) {
                        return '<i class="fa fa-square-o"></i>';
                    } },
                    { title: "Reaction", data: 'id'},
                    { title: "Name", data: 'name'},
                    { title: "Equation", data: 'definition', defaultContent: '-'}
                ],
                rowCallback: function( row, data, index ) {
                    if ( selectedRows.isSelected(data.id) )
                        $(row).addClass('row-select');
                }
            })

            // biochem table controls
            var controls = modal.body().find('.controls');
            var addBtn = $('<button class="btn btn-primary pull-right hide">');
            controls.append(addBtn);

            var selectedRows = new SelectedRows();

            // biochem table events
            table.on('click', 'tbody tr', function() {
                $(this).toggleClass('row-select');

                var data = table.rows( this ).data()[0];

                if ($(this).hasClass('row-select'))
                    selectedRows.add(data);
                else
                    selectedRows.rm(data.id);

                if (selectedRows.count() > 0){
                    addBtn.html('<i class="fa fa-plus"></i> Add ('+selectedRows.count()+')');
                    addBtn.removeClass('hide');
                } else {
                    addBtn.addClass('hide');
                }
            });

            // add compounds on click, hide dialog, give notice
            addBtn.on('click' , function() {
                var data = setRxnDefaults( selectedRows.getSelected() ),
                    op = {op: 'add', data: data};
                editTable(op);
                modal.hide();
                modeling.notice(container, 'Added '+data.length+' compounds')
            })

            modal.show();
        }

        function saveModal() {
            var name = objName // +'-edited';  save as same name by default.
            var input = $('<input type="text" class="form-control" placeholder="my-media-name">'),
                form = $('<div class="form-group">'+
                            '<div class="col-sm-10"></div>' +
                          '</div>');

            input.val(name);
            form.find('div').append(input);

            var modal = $('<div>').kbaseModal({
                title: 'Save Media As...',
                body: form,
                buttons: [{
                    text: 'Cancel'
                }, {
                    text: 'Save',
                    kind: 'primary'
                }]
            })

            modal.button('Save').on('click', function() {
                saveData(getTableData(), wsName, input.val())
            })

            modal.show();
        }

        // function to edit table, store history, and rerender
        function editTable(operation) {
            _editHistory.add(operation);

            container.find('.btn-save').removeClass('hide');

            if (operation.op === 'modify') {
                return;
            } else if (operation.op === 'add') {
                table.rows.add( operation.data ).draw();
            } else if (operation.op === 'rm') {
                table.rows( '.row-select' )
                      .remove()
                      .draw();

                console.log('new rows', table.rows( ))
            }
        }

        // object for selected rows.
        // only used for biochem search engine table.
        function SelectedRows() {
            var rows = [];

            this.add = function(row) {
                rows.push(row);
            }

            this.rm = function(id) {
                var i = id.length;
                for (var i=0; i<rows.length; i++) {
                    if (rows[i].id === id) {
                        rows.splice(i, 1);
                        return;
                    }
                }
            }

            this.isSelected = function(id) {
                for (var i=0; i<rows.length; i++) {
                    if (rows[i].id === id) return true;
                }
                return false;
            }

            this.count = function() {
                return rows.length;
            }

            this.getSelected = function() {
                return rows;
            }

            this.clearAll = function() {
                rows = [];
            }
        }

        // object for managing edit history
        function EditHistory() {
            var ops = [];

            this.add = function(row) {
                ops.push(row);
                console.log('op:', ops)
            }

            this.rm = function(id) {
                var i = id.length;
                for (var i=0; i<ops.length; i++) {
                    if (ops[i].id === id) {
                        ops.splice(i, 1);
                        return;
                    }
                }
            }

            this.count = function() {
                return ops.length;
            }

            this.getHistory = function() {
                return ops;
            }

            this.clearAll = function() {
                ops = [];
            }
        }

        // takes list of cpd info, sets defaults and returns
        // list of cpd objects.
        function setRxnDefaults(rxns) {
            // if not new model, use the same ref
            var ref = modelreactions[0].reaction_ref.split('/');
            var defaultRef = modelreactions.length ?
                ref.slice(0, ref.length-1).join('/')+'/' : '489/6/1/reactions/id/';

            var newRxns = [];
            for (var i=0; i<rxns.length; i++) {
                var rxn = rxns[i];

                newRxns.push({
                    equation: rxn.definition,
                    id: rxn.id+'_c0',
                    reaction_: defaultRef+rxn.id,
                    name: rxn.name,
                    genes: []
                })
            }

            return newRxns;
        }


        // takes optional selector, returns list of
        // data from datatables (instead of api object)
        function getTableData(selector) {
            var d = selector ? table.rows( selector ).data() : table.rows().data();

            var data = [];
            for (var i=0; i<d.length; i++) {
                data.push(d[i]);
            }
            return data;
        }

        // function to save data,
        function saveData(data, ws, name) {
            // don't remove name since it may not be in old objects
            //for (var i=0; i<data.length; i++) {
            //    delete data[i]['name'];
            //}
            rawData.data.mediacompounds = data;

            saveBtn.text('saving...');
            kbapi('ws', 'save_objects', {
                workspace: wsName,
                objects: [{
                    type: 'KBaseBiochem.Media',
                    data: rawData.data,
                    name: name,
                    meta: rawData.info[10]
                }]
            }).done(function(res) {
                saveBtn.text('Save').hide();
                saveAsBtn.text('Save as...').hide();
                modeling.notice(container, 'Saved as '+name, 5000)
            }).fail(function(e) {
                var error = JSON.stringify(JSON.parse(e.responseText), null,4);
                $('<div>').kbaseModal({
                    title: 'Oh no! Something seems to have went wrong',
                    body: '<pre>'+error+'</pre>'
                }).show();
            })
        }

        return this;
    }
})
}( jQuery ) );
