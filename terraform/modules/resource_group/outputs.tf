output "id" {
  description = "The resource group's id."
  value       = azurerm_resource_group.this.id
}

output "name" {
  description = "The resource group's name, which the resources inside it take."
  value       = azurerm_resource_group.this.name
}

output "location" {
  description = "The resource group's region, which the resources inside it take."
  value       = azurerm_resource_group.this.location
}
