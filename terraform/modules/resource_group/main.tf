resource "azurerm_resource_group" "this" {
  location = var.location
  tags     = var.tags
  name     = local.name
}
