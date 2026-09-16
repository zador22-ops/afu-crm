query roles verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query "Types of user roles" {
      sort = {Types_of_user_roles.id: "asc"}
      return = {type: "list"}
    } as $roles

    db.query "Access rights" {
      sort = {Access_rights.id: "asc"}
      return = {type: "list"}
    } as $rights

    // Скільки людей на кожній ролі — щоб було видно, що саме зачепить правка
    db.query Users {
      where = $db.Users.Relevance == true
      return = {type: "list"}
      output = ["id", "types_of_user_roles_id"]
    } as $users
  }

  response = {roles: $roles, rights: $rights, users: $users}
}
