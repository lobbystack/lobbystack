resource "azurerm_subnet" "this" {
  resource_group_name  = var.resource_group_name
  virtual_network_name = var.virtual_network_name
  name                 = local.name
  address_prefixes     = local.address_prefixes
}
