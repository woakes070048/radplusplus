// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.provide("erpnext.stock");

frappe.ui.form.on('Batch Stock Reconciliation', {
	onload: function(frm) {
		frm.add_fetch("item_code", "item_name", "item_name");

		// end of life
		frm.set_query("item_code", "items", function(doc, cdt, cdn) {
			return {
				query: "erpnext.controllers.queries.item_query",
				filters:{
					"is_stock_item": 1,
					"has_serial_no": 0
				}
			}
		});

		if (frm.doc.company) {
			erpnext.queries.setup_queries(frm, "Warehouse", function() {
				return erpnext.queries.warehouse(frm.doc);
			});
		}
	},

	refresh: function(frm) {
		if(frm.doc.docstatus < 1) {
			frm.add_custom_button(__("Items"), function() {
				frm.events.get_items(frm);
			});
			frm.add_custom_button(__("Download"), function() {
				frm.events.download(frm);
			});
		}
	},

	download: function(frm) {
		frappe.prompt({label:"Warehouse", fieldtype:"Link", options:"Warehouse", reqd: 1},
			function(data) {
				var w = window.open(
					frappe.urllib.get_full_url(
						"/api/method/radplusplus.radplusplus.doctype.batch_stock_reconciliation.batch_stock_reconciliation.download?"
						+"warehouse="+encodeURIComponent(data.warehouse)
						+"&posting_date="+encodeURIComponent(frm.doc.posting_date)
						+"&posting_time="+encodeURIComponent(frm.doc.posting_time)));
				if(!w) {
					msgprint(__("Please enable pop-ups")); return;
				}
			}
		, __("Get Items"), __("Download"));
	},

	get_items: function(frm) {
		frappe.prompt({label:"Warehouse", fieldtype:"Link", options:"Warehouse", reqd: 1},
			function(data) {
				frappe.call({
					method:"radplusplus.radplusplus.doctype.batch_stock_reconciliation.batch_stock_reconciliation.get_items_with_batch_no",
					args: {
						warehouse: data.warehouse,
						posting_date: frm.doc.posting_date,
						posting_time: frm.doc.posting_time,
						as_dict: 1
					},
					callback: function(r) {
						var items = [];
						frm.clear_table("items");
						for(var i=0; i< r.message.length; i++) {
							var d = frm.add_child("items");
							$.extend(d, r.message[i]);
							if(!d.qty) d.qty = null;
							if(!d.valuation_rate) d.valuation_rate = null;
						}
						frm.refresh_field("items");
					}
				});
			}
		, __("Get Items"), __("Update"));
	},

	set_valuation_rate_and_qty: function(frm, cdt, cdn) {
		var d = frappe.model.get_doc(cdt, cdn);
		if(d.item_code && d.warehouse) {
			frappe.call({
				method: "erpnext.stock.doctype.stock_reconciliation.stock_reconciliation.get_stock_balance_for",
				args: {
					item_code: d.item_code,
					warehouse: d.warehouse,
					posting_date: frm.doc.posting_date,
					posting_time: frm.doc.posting_time,
					batch_no: d.batch_no
				},
				callback: function(r) {
					frappe.model.set_value(cdt, cdn, "qty", r.message.qty);
					frappe.model.set_value(cdt, cdn, "valuation_rate", r.message.rate);
					frappe.model.set_value(cdt, cdn, "current_qty", r.message.qty);
					frappe.model.set_value(cdt, cdn, "current_valuation_rate", r.message.rate);
					frappe.model.set_value(cdt, cdn, "current_amount", r.message.rate * r.message.qty);
					frappe.model.set_value(cdt, cdn, "amount", r.message.rate * r.message.qty);
					
				}
			});
		}
	},
	set_item_code: function(doc, cdt, cdn) {
		var d = frappe.model.get_doc(cdt, cdn);
		if (d.barcode) {
			frappe.call({
				method: "erpnext.stock.get_item_details.get_item_code",
				args: {"barcode": d.barcode },
				callback: function(r) {
					if (!r.exe){
						frappe.model.set_value(cdt, cdn, "item_code", r.message);
					}
				}
			});
		}
	},
	set_amount_quantity: function(doc, cdt, cdn) {
		var d = frappe.model.get_doc(cdt, cdn);
		if (d.qty & d.valuation_rate) {
			frappe.model.set_value(cdt, cdn, "amount", flt(d.qty) * flt(d.valuation_rate));
			frappe.model.set_value(cdt, cdn, "quantity_difference", flt(d.qty) - flt(d.current_qty));
			frappe.model.set_value(cdt, cdn, "amount_difference", flt(d.amount) - flt(d.current_amount));
		}
	}
});

frappe.ui.form.on("Stock Reconciliation Item", {
	barcode: function(frm, cdt, cdn) {
		frm.events.set_item_code(frm, cdt, cdn);
	},
	warehouse: function(frm, cdt, cdn) {
		frm.events.set_valuation_rate_and_qty(frm, cdt, cdn);
	},
	item_code: function(frm, cdt, cdn) {
		frm.events.set_valuation_rate_and_qty(frm, cdt, cdn);
	},
	batch_no: function(frm, cdt, cdn) {//JDLP - 2017-01-30 - batch_no
		frm.events.set_valuation_rate_and_qty(frm, cdt, cdn);
	},
	qty: function(frm, cdt, cdn) {
		frm.events.set_amount_quantity(frm, cdt, cdn);
	},
	valuation_rate: function(frm, cdt, cdn) {
		frm.events.set_amount_quantity(frm, cdt, cdn);
	}
	
});

erpnext.stock.BatchStockReconciliation = erpnext.stock.StockController.extend({
	onload: function() {
		this.set_default_expense_account();
	},

	set_default_expense_account: function() {
		var me = this;
		if(this.frm.doc.company) {
			if (sys_defaults.auto_accounting_for_stock && !this.frm.doc.expense_account) {
				return this.frm.call({
					method: "erpnext.accounts.utils.get_company_default",
					args: {
						"fieldname": "stock_adjustment_account",
						"company": this.frm.doc.company
					},
					callback: function(r) {
						if (!r.exc) {
							me.frm.set_value("expense_account", r.message);
						}
					}
				});
			}
		}
	},

	setup: function() {
		var me = this;
		this.frm.get_docfield("items").allow_bulk_edit = 1;

		if (sys_defaults.auto_accounting_for_stock) {
			this.frm.add_fetch("company", "stock_adjustment_account", "expense_account");
			this.frm.add_fetch("company", "cost_center", "cost_center");

			this.frm.fields_dict["expense_account"].get_query = function() {
				return {
					"filters": {
						'company': me.frm.doc.company,
						"is_group": 0
					}
				}
			}
			this.frm.fields_dict["cost_center"].get_query = function() {
				return {
					"filters": {
						'company': me.frm.doc.company,
						"is_group": 0
					}
				}
			}
		}
	},

	refresh: function() {
		if(this.frm.doc.docstatus==1) {
			this.show_stock_ledger();
			if (cint(frappe.defaults.get_default("auto_accounting_for_stock"))) {
				this.show_general_ledger();
			}
		}
	},

});

cur_frm.cscript = new erpnext.stock.BatchStockReconciliation({frm: cur_frm});


// JDLP - 2017-01-30 - batch_no, copie de stock_entry.js
// Overloaded query for link batch_no
cur_frm.fields_dict['items'].grid.get_field('batch_no').get_query = function(doc, cdt, cdn) {
	var item = locals[cdt][cdn];
	if(!item.item_code) {
		frappe.throw(__("Please enter Item Code to get batch no"));
	}
	else {
		var filters = {
				'item_code': item.item_code
			}
		if(item.s_warehouse) filters["warehouse"] = item.s_warehouse
		return {
			query : "erpnext.controllers.queries.get_batch_no",
			filters: filters
		}
	}
}