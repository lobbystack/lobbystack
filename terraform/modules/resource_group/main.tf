resource "azurerm_resource_group" "this" {
  name = join("-", compact([
    var.app_name,
    "resource-group",
    var.environment,
  ]))
  location = var.location
  tags     = var.tags
}
