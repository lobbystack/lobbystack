output "ids" {
  description = "The rules' ids, by rule name."
  value       = { for name, rule in azurerm_network_security_rule.this : name => rule.id }
}
