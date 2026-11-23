locals {
  name = join("-", compact([
    var.app_name,
    "network-security-group",
    var.environment,
  ]))
}
