output "public_ip" {
  description = "The server's static public address. The carrier sends calls here."
  value       = azurerm_public_ip.sip.ip_address
}

output "zadarma_sip_host" {
  description = "The value for ZADARMA_SIP_HOST on the worker."
  value       = "${azurerm_public_ip.sip.ip_address}:5060"
}

output "zadarma_destination_example" {
  description = "What to set as a Zadarma number's destination. The user part is the number's digits, with no plus."
  value       = "381213860081@${azurerm_public_ip.sip.ip_address}:5060"
}

output "dns_name" {
  description = "The VM's Azure DNS name, when dns_label is set."
  value       = azurerm_public_ip.sip.fqdn
}

output "ssh_command" {
  description = "How to log in, once ssh_allowed_cidrs allows your address."
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.sip.ip_address}"
}
