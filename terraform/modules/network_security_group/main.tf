resource "azurerm_network_security_group" "this" {
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
  name                = local.name
}
