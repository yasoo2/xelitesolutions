$ErrorActionPreference='Stop'
$test='D:\Joe\muse-worktree\tmp\verify-msgdelivery\Test-WorkerMessageDelivery.muse-rerun.ps1'
$which=$args[0]
if($which -eq 'old'){
  & $test -WorkerPaths @('D:\Joe\coordination\muse-worker.ps1.before-message-delivery-20261003T104319400.bak','D:\Joe\coordination\nvidia-worker.ps1.before-message-delivery-20261003T104319400.bak')
}else{
  & $test
}
