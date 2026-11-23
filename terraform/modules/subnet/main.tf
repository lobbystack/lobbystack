resource "azurerm_subnet" "this" {
  name = join("-", compact([
    var.app_name,
    "subnet",
    var.environment,
  ]))
  resource_group_name  = var.resource_group_name
  virtual_network_name = var.virtual_network_name
  address_prefixes     = var.address_prefixes
}
