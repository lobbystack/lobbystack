output "id" {
  description = "The interface's id, which a VM and a security group association take."
  value       = azurerm_network_interface.this.id
}

output "private_ip_address" {
  description = "The interface's private address."
  value       = azurerm_network_interface.this.private_ip_address
}
