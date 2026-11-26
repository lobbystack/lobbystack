resource "azurerm_public_ip" "this" {
  location            = var.location
  resource_group_name = var.resource_group_name
  domain_name_label   = var.domain_name_label
  tags                = var.tags
  name                = local.name
  allocation_method   = local.allocation_method
  sku                 = local.sku
}
