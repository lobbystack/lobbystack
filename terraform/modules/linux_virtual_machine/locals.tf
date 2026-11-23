locals {
  name = join("-", compact([
    var.app_name,
    "linux-virtual-machine",
    var.environment,
  ]))

  os_disk = {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
  }

  image = {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }
}
