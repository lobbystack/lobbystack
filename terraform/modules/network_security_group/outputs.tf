output "id" {
  description = "The group's id, which a network interface association takes."
  value       = azurerm_network_security_group.this.id
}

output "name" {
  description = "The group's name, which its rules take."
  value       = azurerm_network_security_group.this.name
}
