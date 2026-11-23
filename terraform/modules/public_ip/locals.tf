locals {
  name = join("-", compact([
    var.app_name,
    "public-ip",
    var.environment,
  ]))

  # Static, because a carrier routes each number to this address, and a dynamic one changes when the VM restarts.
  allocation_method = "Static"
  sku               = "Standard"
}
