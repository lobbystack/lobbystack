output "environment" {
  description = "The environment this configuration was applied for."
  value       = var.environment
}

output "resource_group_name" {
  description = "The resource group that holds everything. start.py and stop.py take its environment."
  value       = module.resource_group.name
}

output "public_ip" {
  description = "The server's static public address. The carrier sends calls here."
  value       = module.public_ip.ip_address
}

output "zadarma_sip_host" {
  description = "The value for ZADARMA_SIP_HOST on the worker."
  value       = "${module.public_ip.ip_address}:5060"
}

output "zadarma_destination_example" {
  description = "What to set as a Zadarma number's destination. The user part is the number's digits, with no plus."
  value       = "381213860081@${module.public_ip.ip_address}:5060"
}

output "dns_name" {
  description = "The VM's Azure DNS name, when dns_label is set."
  value       = module.public_ip.fqdn
}

output "ssh_command" {
  description = "How to log in, once ssh_allowed_cidrs allows your address."
  value       = "ssh ${var.admin_username}@${module.public_ip.ip_address}"
}

output "app_public_ip" {
  description = "The web app VM's static address, or null when deploy_app is off."
  value       = local.app_ip
}

output "app_url" {
  description = "Where the web app answers once the DNS records resolve and the stack is running."
  value       = var.deploy_app && var.app_domain != "" ? "https://${var.app_domain}" : null
}

output "app_dns_records" {
  description = "The records to create at the domain's registrar, where the domain's DNS is hosted, such as Cloudflare's DNS tab."
  value       = local.app_dns_records
}

output "app_ssh_command" {
  description = "How to log in to the web app VM, once ssh_allowed_cidrs allows your address."
  value       = var.deploy_app ? "ssh ${var.admin_username}@${local.app_ip}" : null
}

