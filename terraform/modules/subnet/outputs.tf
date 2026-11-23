output "id" {
  description = "The subnet's id, which a network interface attaches to."
  value       = azurerm_subnet.this.id
}

output "name" {
  description = "The subnet's name."
  value       = azurerm_subnet.this.name
}
