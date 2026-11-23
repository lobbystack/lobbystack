resource "azurerm_linux_virtual_machine" "this" {
  name = join("-", compact([
    var.app_name,
    "linux-virtual-machine",
    var.environment,
  ]))
  location                        = var.location
  resource_group_name             = var.resource_group_name
  size                            = var.size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = var.network_interface_ids
  custom_data                     = var.custom_data
  tags                            = var.tags

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }

  os_disk {
    caching              = local.os_disk.caching
    storage_account_type = local.os_disk.storage_account_type
  }

  source_image_reference {
    publisher = local.image.publisher
    offer     = local.image.offer
    sku       = local.image.sku
    version   = local.image.version
  }
}
