# A VM that runs the SIP server in docker/asterisk. It takes a carrier's calls, such as Zadarma's, and passes them to
# OpenAI. See docs/voice/external-numbers.md.
#
# Each Azure resource type has its own module in modules/, and a module creates only that type. This file wires
# them together, and locals.tf holds the values they share.

# The state of every environment would otherwise be one file, and applying one environment would plan to remove the
# other's resources. Each environment has its own workspace. dev's state was created before workspaces, in the default
# one, so that stays valid for dev. See README.md.
check "workspace_matches_environment" {
  assert {
    condition     = terraform.workspace == var.environment || (terraform.workspace == "default" && var.environment == "dev")
    error_message = "This is the ${terraform.workspace} workspace but the environment is ${var.environment}. Run `terraform workspace select ${var.environment}`, or create it with `terraform workspace new ${var.environment}`."
  }
}

# Each environment gets its own resource group, so destroying one environment can never touch another's resources.
# Every resource is named from app_name, its type and the environment. See AGENTS.md.
module "resource_group" {
  source = "./modules/resource_group"

  app_name    = var.app_name
  environment = var.environment
  location    = var.location
  tags        = local.tags
}

module "virtual_network" {
  source = "./modules/virtual_network"

  app_name = var.app_name

  environment         = var.environment
  location            = module.resource_group.location
  resource_group_name = module.resource_group.name
  address_space       = ["10.20.0.0/16"]
  tags                = local.tags
}

module "subnet" {
  source = "./modules/subnet"

  app_name = var.app_name

  environment          = var.environment
  resource_group_name  = module.resource_group.name
  virtual_network_name = module.virtual_network.name
  address_prefixes     = ["10.20.1.0/24"]
}

# Static, because the carrier routes each number to this address, and a dynamic one changes when the VM restarts.
module "public_ip" {
  source = "./modules/public_ip"

  app_name = var.app_name

  environment         = var.environment
  location            = module.resource_group.location
  resource_group_name = module.resource_group.name
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = var.dns_label
  tags                = local.tags
}

# Azure denies everything inbound that no rule allows. Only the rules below open anything.
module "network_security_group" {
  source = "./modules/network_security_group"

  app_name = var.app_name

  environment         = var.environment
  location            = module.resource_group.location
  resource_group_name = module.resource_group.name
  tags                = local.tags
}

module "network_security_rule" {
  source = "./modules/network_security_rule"

  resource_group_name         = module.resource_group.name
  network_security_group_name = module.network_security_group.name
  rules                       = local.network_security_rules
}

module "network_interface" {
  source = "./modules/network_interface"

  app_name = var.app_name

  environment          = var.environment
  location             = module.resource_group.location
  resource_group_name  = module.resource_group.name
  subnet_id            = module.subnet.id
  public_ip_address_id = module.public_ip.id
  tags                 = local.tags
}

module "network_interface_security_group_association" {
  source = "./modules/network_interface_security_group_association"

  network_interface_id      = module.network_interface.id
  network_security_group_id = module.network_security_group.id
}

module "linux_virtual_machine" {
  source = "./modules/linux_virtual_machine"

  app_name = var.app_name

  environment           = var.environment
  location              = module.resource_group.location
  resource_group_name   = module.resource_group.name
  size                  = var.vm_size
  admin_username        = var.admin_username
  admin_ssh_public_key  = var.ssh_public_key
  network_interface_ids = [module.network_interface.id]
  custom_data           = base64encode(local.cloud_init)
  tags                  = local.tags
}

# The resources moved from the root into modules. These blocks make Terraform adopt what already exists under the old
# addresses instead of destroying it. Once every state that held the old addresses has applied, they can be deleted.
moved {
  from = azurerm_resource_group.sip
  to   = module.resource_group.azurerm_resource_group.this
}

moved {
  from = azurerm_virtual_network.sip
  to   = module.virtual_network.azurerm_virtual_network.this
}

moved {
  from = azurerm_subnet.sip
  to   = module.subnet.azurerm_subnet.this
}

moved {
  from = azurerm_public_ip.sip
  to   = module.public_ip.azurerm_public_ip.this
}

moved {
  from = azurerm_network_security_group.sip
  to   = module.network_security_group.azurerm_network_security_group.this
}

moved {
  from = azurerm_network_security_rule.sip_from_carrier[0]
  to   = module.network_security_rule.azurerm_network_security_rule.this["sip-from-carrier"]
}

moved {
  from = azurerm_network_security_rule.audio_from_carrier[0]
  to   = module.network_security_rule.azurerm_network_security_rule.this["audio-from-carrier"]
}

moved {
  from = azurerm_network_security_rule.audio_from_openai
  to   = module.network_security_rule.azurerm_network_security_rule.this["audio-from-openai"]
}

moved {
  from = azurerm_network_security_rule.ssh[0]
  to   = module.network_security_rule.azurerm_network_security_rule.this["ssh"]
}

moved {
  from = azurerm_network_interface.sip
  to   = module.network_interface.azurerm_network_interface.this
}

moved {
  from = azurerm_network_interface_security_group_association.sip
  to   = module.network_interface_security_group_association.azurerm_network_interface_security_group_association.this
}

moved {
  from = azurerm_linux_virtual_machine.sip
  to   = module.linux_virtual_machine.azurerm_linux_virtual_machine.this
}
