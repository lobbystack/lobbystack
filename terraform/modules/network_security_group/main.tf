resource "azurerm_network_security_group" "this" {
  name = join("-", compact([
    var.app_name,
    "network-security-group",
    var.environment,
  ]))
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}
