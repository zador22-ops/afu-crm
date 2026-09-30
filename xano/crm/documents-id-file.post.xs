query "documents/{document_id}/file" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Файл документа: лише PDF або DOCX (afu-crm#6)
  input {
    int document_id filters=min:1
    file file
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 15, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get document {
      field_name = "id"
      field_value = $input.document_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Документ не знайдено"
    }
    storage.create_attachment {
      value = $input.file
      access = "public"
      filename = ""
    } as $att
    api.lambda {
      code = """
        const a = $var.att || {};
        const name = String(a.name || '').toLowerCase();
        const mime = String(a.mime || '').toLowerCase();
        return mime === 'application/pdf' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.(pdf|docx)$/.test(name);
      """
      timeout = 10
    } as $typeOk
    precondition ($typeOk == true) {
      error_type = "badrequest"
      error = "Документ має бути PDF або DOCX"
    }
    db.edit document {
      field_name = "id"
      field_value = $input.document_id
      data = {file: $att, updated_at: "now"}
    } as $item
  }

  response = $item
}
