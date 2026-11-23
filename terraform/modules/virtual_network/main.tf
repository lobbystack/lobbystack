resource "azurerm_virtual_network" "this" {
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
  name                = local.name
  address_space       = local.address_space
}
