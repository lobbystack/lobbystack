resource "azurerm_network_interface" "this" {
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
  name                = local.name

  ip_configuration {
    subnet_id                     = var.subnet_id
    public_ip_address_id          = var.public_ip_address_id
    name                          = local.ip_configuration_name
    private_ip_address_allocation = local.private_ip_address_allocation
  }
}
