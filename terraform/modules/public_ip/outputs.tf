output "id" {
  description = "The address resource's id, which a network interface attaches."
  value       = azurerm_public_ip.this.id
}

output "ip_address" {
  description = "The public address itself."
  value       = azurerm_public_ip.this.ip_address
}

output "fqdn" {
  description = "The Azure DNS name, when domain_name_label is set."
  value       = azurerm_public_ip.this.fqdn
}
