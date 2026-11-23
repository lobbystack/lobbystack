locals {
  name = join("-", compact([
    var.app_name,
    "virtual-network",
    var.environment,
  ]))

  address_space = ["10.20.0.0/16"]
}
