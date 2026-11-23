locals {
  name = join("-", compact([
    var.app_name,
    "subnet",
    var.environment,
  ]))

  address_prefixes = ["10.20.1.0/24"]
}
