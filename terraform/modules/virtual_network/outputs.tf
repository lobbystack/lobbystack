output "id" {
  description = "The virtual network's id."
  value       = azurerm_virtual_network.this.id
}

output "name" {
  description = "The virtual network's name, which its subnets take."
  value       = azurerm_virtual_network.this.name
}
