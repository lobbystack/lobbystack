variable "resource_group_name" {
  description = "The resource group that holds the network security group."
  type        = string
}

variable "network_security_group_name" {
  description = "The network security group the rules belong to."
  type        = string
}

variable "rules" {
  description = "The rules, by name. An inbound allow from any port to any address is the default, so a rule names only what differs. A rule's source is source_address_prefixes (a list of addresses) or source_address_prefix (one address, or a service tag such as Internet, which Azure refuses inside the list)."
  type = map(object({
    priority                   = number
    protocol                   = string
    destination_port_range     = string
    source_address_prefixes    = optional(list(string))
    source_address_prefix      = optional(string)
    direction                  = optional(string, "Inbound")
    access                     = optional(string, "Allow")
    source_port_range          = optional(string, "*")
    destination_address_prefix = optional(string, "*")
  }))
  default = {}

  validation {
    condition     = alltrue([for rule in values(var.rules) : rule.priority >= 100 && rule.priority <= 4096])
    error_message = "A rule's priority is between 100 and 4096."
  }

  validation {
    condition     = length(distinct([for rule in values(var.rules) : "${rule.direction}-${rule.priority}"])) == length(var.rules)
    error_message = "Two rules in the same direction can't share a priority."
  }

  validation {
    condition     = alltrue([for rule in values(var.rules) : (rule.source_address_prefixes == null) != (rule.source_address_prefix == null)])
    error_message = "A rule sets source_address_prefixes, a list of addresses, or source_address_prefix, one address or service tag, and not both. Azure refuses a service tag such as Internet inside the list."
  }

  validation {
    condition     = alltrue([for rule in values(var.rules) : !contains(concat(coalesce(rule.source_address_prefixes, []), compact([rule.source_address_prefix])), "0.0.0.0/0") && !contains(concat(coalesce(rule.source_address_prefixes, []), compact([rule.source_address_prefix])), "*")])
    error_message = "A rule can't open a port to every address with 0.0.0.0/0 or *. List the addresses that need it, or use the Internet service tag where the whole internet is meant, as for a public website."
  }
}
