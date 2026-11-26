variable "network_interface_id" {
  description = "The network interface to protect."
  type        = string
}

variable "network_security_group_id" {
  description = "The network security group that protects it."
  type        = string
}
