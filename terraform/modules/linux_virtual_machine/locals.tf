locals {
  os_disk = {
    caching              = "ReadWrite"
    storage_account_type = var.os_disk_storage_account_type
  }

  image = var.image
}
