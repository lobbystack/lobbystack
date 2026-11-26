locals {
  name = join("-", compact([
    var.app_name,
    "network-interface",
    var.environment,
  ]))

  # The interface has one IP configuration, so its name never needs to differ.
  ip_configuration_name = "primary"

  private_ip_address_allocation = "Dynamic"
}
