# A place to try a change on its own, with the carrier's sandbox or a spare number, before it reaches prod.
# Settings that aren't secret. The SSH key, the addresses that may reach SSH and the OpenAI project id go in
# terraform.tfvars, which is gitignored. Use it with: terraform plan -var-file=environments/sandbox.tfvars

environment = "sandbox"

# The NPD subscription, which holds dev and sandbox.
subscription_id = "273b7dfc-11a7-452b-941b-325123dfeaf0"
app_name        = "lobbystack"
location        = "polandcentral"
vm_size         = "Standard_B2ls_v2"

# The carrier's SIP server addresses. Zadarma's servers sit in 185.45.152.0/22. Narrow it once you know which
# addresses the calls come from. Empty leaves the server closed to every carrier.
carrier_ips = ["185.45.152.0/22"]
