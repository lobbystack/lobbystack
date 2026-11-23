locals {
  name = join("-", compact([
    var.app_name,
    "resource-group",
    var.environment,
  ]))
}
