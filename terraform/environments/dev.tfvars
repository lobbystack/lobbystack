# Day-to-day testing. Stop the VM with scripts/python/stop.py when you aren't using it.
# Settings that aren't secret. The SSH key, the addresses that may reach SSH and the OpenAI project id go in
# terraform.tfvars, which is gitignored. Use it with: terraform plan -var-file=environments/dev.tfvars

environment = "dev"

# The NPD subscription, which holds dev and sandbox.
subscription_id = "273b7dfc-11a7-452b-941b-325123dfeaf0"
app_name        = "lobbystack"
location        = "polandcentral"
vm_size         = "Standard_B2ls_v2"

# The carrier's SIP server addresses. Zadarma's servers sit in 185.45.152.0/22. Narrow it once you know which
# addresses the calls come from. Empty leaves the server closed to every carrier.
carrier_ips = ["185.45.152.0/22"]

# The web app on its own VM, on dev.lobbystack.com. Create the records that the app_dns_records output lists at the registrar.
# It clones the branch below on its first boot, so push the branch before you apply.
deploy_app         = true
app_domain         = "dev.lobbystack.com"
app_repository_ref = "feature/external-phone-numbers"

