variable "resource_group_name" {
  description = "The resource group that holds the network security group."
  type        = string
}

variable "network_security_group_name" {
  description = "The network security group the rules belong to."
  type        = string
}

variable "rules" {
  description = "The rules, by name. An inbound allow from any port to any address is the default, so a rule names only what differs."
  type = map(object({
    priority                   = number
    protocol                   = string
    destination_port_range     = string
    source_address_prefixes    = list(string)
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
    condition     = alltrue([for rule in values(var.rules) : !contains(rule.source_address_prefixes, "0.0.0.0/0") && !contains(rule.source_address_prefixes, "*")])
    error_message = "A rule can't open a port to the whole internet. List the addresses that need it."
  }
}
