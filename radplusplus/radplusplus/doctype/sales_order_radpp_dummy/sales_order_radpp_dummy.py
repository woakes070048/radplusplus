# -*- coding: utf-8 -*-
# Copyright (c) 2015, RAD plus plus inc. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class SalesOrderRadppdummy(Document):
	pass

	
@frappe.whitelist()
def make_material_request(source_name, target_doc=None):
	frappe.throw(("radd make_material_request:"))