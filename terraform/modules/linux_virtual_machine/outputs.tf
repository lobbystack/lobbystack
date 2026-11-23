output "id" {
  description = "The VM's id."
  value       = azurerm_linux_virtual_machine.this.id
}

output "name" {
  description = "The VM's name."
  value       = azurerm_linux_virtual_machine.this.name
}
