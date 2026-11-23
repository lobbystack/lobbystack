resource "azurerm_virtual_network" "this" {
  name = join("-", compact([
    var.app_name,
    "virtual-network",
    var.environment,
  ]))
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = var.address_space
  tags                = var.tags
}
