# IMPLEMENTED-vs-REGISTERED reconciliation — exact f40 bytes

SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048 (api/src/modules/tools subtree, git-archive extracted)
METHOD=static parse of registry.ts registration positions vs exported symbols in definitions/*.ts
SCOPE=class/const registration only; alias maps, planner catalogue and executor dispatch are separate layers (not covered here)

DEFINITION_FILES=93
EXPORTED_SYMBOLS=480
REGISTRY_REFERENCED_IDENTIFIERS=165
IMPLEMENTED_AND_REGISTERED=162
IMPLEMENTED_NOT_REGISTERED=318
REFERENCED_NOT_IMPLEMENTED=0

## IMPLEMENTED_NOT_REGISTERED (exported symbol, no registry reference)

| symbol | file(s) | tool name |
|---|---|---|
| Accounts | react-app-templates.ts | ? |
| AdminPanel | ReactProjectTool.ts | ? |
| AdvancedTools | AdvancedTools.ts | ? |
| App | MobileBuilderTool.ts, react-app-templates.ts, ReactProjectTool.ts | ? |
| AppNavigator | MobileBuilderTool.ts | ? |
| AppProvider | MobileBuilderTool.ts | ? |
| BulkFileGeneratorTool | BulkFileGeneratorTool.ts | bulk_file_generator |
| CATALOGUE_COLUMNS | ApiProjectTool.ts | ? |
| CalculatorApp | react-app-templates.ts | ? |
| ChatApp | react-app-templates.ts | ? |
| CodebaseNavigatorTool | CodebaseNavigatorTool.ts | codebase_navigator |
| Compare | ReactProjectTool.ts | ? |
| Contact | ReactProjectTool.ts | ? |
| CostCalculator | ProjectEditTool.ts | ? |
| Cta | ReactProjectTool.ts | ? |
| CustomApp | react-app-templates.ts | ? |
| DISCOVERY_YIELD_EVERY | EngineeringDiscoveryTool.ts | ? |
| ENGINEERING_ARTIFACT_PROVIDER_DEADLINE_MS | AIGeneratorTool.ts | ? |
| ENGINEERING_LLM_GENERATION_DEADLINE_MS | AIGeneratorTool.ts | ? |
| Faq | ProjectEditTool.ts, ReactProjectTool.ts | ? |
| Features | ReactProjectTool.ts | ? |
| FinanceApp | react-app-templates.ts | ? |
| Footer | ReactProjectTool.ts | ? |
| Gallery | ReactProjectTool.ts | ? |
| GrepSearchTool | SystemTools.ts | grep_search |
| Hero | ReactProjectTool.ts | ? |
| ImageGenerationTool | ImageGenerationTool.ts | generate_image |
| LLM_GENERATION_DEADLINE_MS | AIGeneratorTool.ts | ? |
| LOCAL_RECORDS_FALLBACK_INSTALL_TIMEOUTS | ReactProjectTool.ts | viewport |
| Layout | OrionBusinessFoundationTool.ts | ? |
| LedgerApp | react-app-templates.ts | ? |
| Link | ReactProjectTool.ts | ? |
| Location | ReactProjectTool.ts | ? |
| MapApp | react-app-templates.ts | ? |
| Menu | ReactProjectTool.ts | ? |
| Navbar | ReactProjectTool.ts | ? |
| OperationsConsole | EnterprisePlatformFoundationTool.ts | ? |
| OrderButton | ReactProjectTool.ts | ? |
| PANEL_BROWSER_SID | BrowserSmartTools.ts | ? |
| PERMISSIONS | AuthBuilderTool.ts | ? |
| PROJECT_DIR_NAME_MAX_LENGTH | ReactProjectTool.ts | فحص وضبط شامل |
| PROJECT_SLUG_FOR_TEST | ReactProjectTool.ts | ? |
| Page | OrionBusinessFoundationTool.ts | ? |
| Pricing | ReactProjectTool.ts | ? |
| ProductView | ReactProjectTool.ts | ? |
| ProductivityApp | react-app-templates.ts | ? |
| Products | ReactProjectTool.ts | ? |
| REACT_NETWORK_INSTALL_TIMEOUTS | ReactProjectTool.ts | ? |
| ROLES | ApiProjectTool.ts | ${js(s.name)} |
| RUNTIME_ARTIFACT_SOURCE_ARRAY_KEYS | PhaseExecutorTool.ts | ? |
| RUNTIME_ARTIFACT_SOURCE_KEYS | PhaseExecutorTool.ts | ? |
| RUNTIME_LOGICAL_SOURCE_TOOLS | PhaseExecutorTool.ts | ? |
| RecordsApp | react-app-templates.ts | ? |
| RootLayout | EnterprisePlatformFoundationTool.ts | ? |
| ShopApp | react-app-templates.ts | ? |
| SocialApp | react-app-templates.ts | ? |
| Stats | ReactProjectTool.ts | ? |
| Steps | ReactProjectTool.ts | ? |
| Story | ReactProjectTool.ts | ? |
| TABLES | react-app-templates.ts | title |
| TablesAdmin | react-app-templates.ts | ? |
| Team | ReactProjectTool.ts | ? |
| Testimonials | ReactProjectTool.ts | ? |
| VisualQATool | VisualQATool.ts | visual_qa |
| WeatherApp | react-app-templates.ts | ? |
| _runningServers | ProjectRunTool.ts | ? |
| adoptLocalImage | ProjectEditTool.ts | ? |
| alignGreenfieldPlanIdentity | ProjectPipelineTool.ts | ? |
| apiColumnsForRequest | ApiProjectTool.ts | ? |
| apiLogout | react-app-templates.ts | ? |
| apiPrimaryColumnsForApp | ApiProjectTool.ts | ? |
| apiRelationForRequest | ApiProjectTool.ts | ? |
| apiResourceForKind | ApiProjectTool.ts | ? |
| apiSibling | react-app-templates.ts | ? |
| apiSiblingOf | ProjectPipelineTool.ts | ? |
| app | ProjectPlannerTool.ts | React browser application |
| appPagesFor | ReactProjectTool.ts | ? |
| applyBundledPhotographyFallback | ReactProjectTool.ts | ? |
| applyEditBlock | ProjectEditTool.ts | ? |
| applyLiveRunOutcome | ProjectPipelineTool.ts | ? |
| applyPhaseExecutionEvidence | PhaseExecutorTool.ts | ? |
| applyProjectQualityContractOutcome | ProjectPipelineTool.ts | ? |
| applyScopeAuditOutcome | ProjectPipelineTool.ts | ? |
| artifactLanguageIsArabic | ReactProjectTool.ts | ? |
| asksToOpenTheActiveApp | BrowserRunTool.ts | ? |
| assessWebDeliveryQuality | WebPageBuilderTool.ts | ? |
| attachedImagePath | ProjectEditTool.ts | ? |
| authConfig | AuthBuilderTool.ts | ? |
| authMiddleware | AuthBuilderTool.ts | ? |
| blank | react-app-templates.ts | ? |
| boundedChangeValue | ProjectEditTool.ts | ? |
| buildAppFiles | react-app-templates.ts | ? |
| buildDeliveryBlocked | ReactProjectTool.ts | ? |
| buildPipelineDecisionEvidence | ProjectPipelineTool.ts | ? |
| buildPlannerEvidence | ProjectPipelineTool.ts | ? |
| buildProbeList | ProjectRunTool.ts | ? |
| buildTimeBlock | CentralAnswerTool.ts | ? |
| canAdoptRecordedLive | ProjectRunTool.ts | ? |
| canBindRuntimeProjectEvidence | PhaseExecutorTool.ts | ? |
| canBuildDependencyFreeRecordsApp | ReactProjectTool.ts | ? |
| canManageUsers | ApiProjectTool.ts | ? |
| canRetireSupersededLiveServer | ReactProjectTool.ts | ? |
| canSyncRuntimeProjectContext | PhaseExecutorTool.ts | ? |
| canWrite | ApiProjectTool.ts | ? |
| canWriteNow | react-app-templates.ts | ? |
| capabilityEvidenceNotice | ReactProjectTool.ts | ? |
| cardFor | react-app-templates.ts | ? |
| classifyStructuredRuntimeEvidence | PhaseExecutorTool.ts | ? |
| clearMisses | ApiProjectTool.ts | ? |
| computeMetric | react-app-templates.ts | ? |
| content | react-app-templates.ts, ReactProjectTool.ts | ${js(t.name)} |
| createStore | react-app-templates.ts | ? |
| dayPartFor | CentralAnswerTool.ts | ? |
| db | ApiProjectTool.ts | ? |
| declaredLaunchPrerequisitePackages | ProjectRunTool.ts | ? |
| deliveryErrorForAcceptance | ReactProjectTool.ts | ? |
| deliveryErrorForBuild | ReactProjectTool.ts | ? |
| deliveryErrorForVisualAudit | ReactProjectTool.ts | ? |
| deliveryVoiceOverlap | ReactProjectTool.ts | ? |
| dependencyFreeRecordsBuildEvidence | QualityTools.ts | ? |
| dependencyFreeRecordsBundleRoot | ProjectRunTool.ts | ? |
| deriveRequestFidelity | ReactProjectTool.ts | ? |
| destroySession | AuthBuilderTool.ts | ? |
| detectStart | ProjectRunTool.ts | ? |
| deterministicExistingEditPhasesFor | ProjectPipelineTool.ts | ? |
| deterministicPhasesFor | ProjectPipelineTool.ts | ? |
| deterministicRescueAllowed | ProjectPipelineTool.ts | ? |
| deterministicRescueForDeadPlanner | ProjectPipelineTool.ts | ? |
| diffSummary | ProjectEditTool.ts | ? |
| download | react-app-templates.ts | ? |
| durablePreviewEligible | ProjectPipelineTool.ts | ? |
| earlyProjectDeclaration | ReactProjectTool.ts | ? |
| ensureReactRuntimeImport | ReactProjectTool.ts | ? |
| entities | ApiProjectTool.ts | ? |
| entityCounts | ApiProjectTool.ts | ? |
| externalApiExpectationFromRecord | ProjectPipelineTool.ts | ? |
| extractMissingLocalRuntimeImportLedger | ProjectPipelineTool.ts | ? |
| extractNpmInvalidVersionEvidence | SystemTools.ts | ? |
| fileAccountsCss | react-app-templates.ts | ? |
| fileAccountsJsx | react-app-templates.ts | ? |
| fileAppContentJs | react-app-templates.ts | ? |
| fileAppCss | react-app-templates.ts | ? |
| fileAppIndexHtml | react-app-templates.ts | ? |
| fileAppMainJsx | react-app-templates.ts | ? |
| fileAppPackageJson | react-app-templates.ts | ? |
| fileAppShellJsx | react-app-templates.ts | ? |
| fileAppSmokeTest | react-app-templates.ts | ? |
| fileAppStoreJs | react-app-templates.ts | ? |
| fileCalculatorAppJsx | react-app-templates.ts | ? |
| fileCalculatorCss | react-app-templates.ts | ? |
| fileChatAppJsx | react-app-templates.ts | ? |
| fileFinanceAppJsx | react-app-templates.ts | ? |
| fileLedgerAppJsx | react-app-templates.ts | ? |
| fileLedgerCss | react-app-templates.ts | ? |
| fileMapAppJsx | react-app-templates.ts | ? |
| fileProductivityAppJsx | react-app-templates.ts | ? |
| fileProductivityCss | react-app-templates.ts | ? |
| fileRecordsAppJsx | react-app-templates.ts | ? |
| fileRecordsControllerJs | react-app-templates.ts | ? |
| fileRecordsViewJsx | react-app-templates.ts | ? |
| fileRecordsWrapperJsx | react-app-templates.ts | ? |
| fileShopAppJsx | react-app-templates.ts | ? |
| fileShopCss | react-app-templates.ts | ? |
| fileSocialAppJsx | react-app-templates.ts | ? |
| fileTablesAdminCss | react-app-templates.ts | ? |
| fileTablesAdminJsx | react-app-templates.ts | ? |
| fileWeatherAppJsx | react-app-templates.ts | ? |
| fileWorkflowAppJsx | react-app-templates.ts | ? |
| fileWorkflowCss | react-app-templates.ts | ? |
| finalBrowserQaUrl | ProjectPipelineTool.ts | ? |
| gapsProvenByAcceptance | ReactProjectTool.ts | ? |
| generateToken | AuthBuilderTool.ts | ? |
| getRole | react-app-templates.ts | ? |
| getToken | react-app-templates.ts | ? |
| githubReportLanguage | GitHubRepoManagerTool.ts | ? |
| githubUrlFrom | ImportProjectTool.ts | ? |
| groupTotals | react-app-templates.ts | ? |
| guardRequiredInput | react-app-templates.ts | ? |
| hasOnlyBrowserQaInfrastructureFindings | ProjectPipelineTool.ts | ? |
| hasPermission | AuthBuilderTool.ts | ? |
| hasRequestFidelityEvidenceUnavailable | ProjectPipelineTool.ts | ? |
| hasRequestFidelityMismatch | ProjectPipelineTool.ts | ? |
| hasRole | AuthBuilderTool.ts | ? |
| hasUsableReactDependencyTree | ReactProjectTool.ts | ? |
| hashPassword | ApiProjectTool.ts | ? |
| heroLayoutFor | ReactProjectTool.ts | ? |
| heroSecondaryDestination | ReactProjectTool.ts | ? |
| imageOf | react-app-templates.ts | ? |
| inheritRuntimeProjectArguments | PhaseExecutorTool.ts | ? |
| inspectProjectQualityContract | ProjectPipelineTool.ts | ? |
| installTimeoutsForRecordsRecovery | ReactProjectTool.ts | ? |
| interactiveAppNeedsReactBuilder | ProjectPipelineTool.ts | ? |
| interruptedWindowsNativeTools | ReactProjectTool.ts | ? |
| isActionableEditRequest | ProjectEditTool.ts | ? |
| isAdmin | AuthBuilderTool.ts | ? |
| isExternalIntegrationArtifact | ReactProjectTool.ts | ? |
| isFeedResource | ApiProjectTool.ts | ? |
| isLocked | ApiProjectTool.ts | ? |
| isModerator | AuthBuilderTool.ts | ? |
| isNamedRowTextEditRequest | ProjectEditTool.ts | ? |
| isOwnerNow | react-app-templates.ts | ? |
| isReactViteProjectDir | ReactProjectTool.ts | ? |
| isRole | ApiProjectTool.ts | ? |
| isSafeTestScript | ImportProjectTool.ts | ? |
| isToday | react-app-templates.ts | ? |
| isWorkspaceOverviewRequest | ProjectPipelineTool.ts | ? |
| launchPrerequisiteError | ProjectRunTool.ts | ? |
| launchabilityError | ProjectRunTool.ts | ? |
| liveProjectRecord | ProjectRunTool.ts | ? |
| localFileExistsWithExactCase | ProjectRunTool.ts | ? |
| localLivePreviewFor | BrowserRunTool.ts | ? |
| mapRuntimeArtifactSourceArguments | PhaseExecutorTool.ts | ? |
| matchingLocalNpmCache | ApiProjectTool.ts | ? |
| mayTouch | ApiProjectTool.ts | ? |
| measuredAppAbilities | ReactProjectTool.ts | ? |
| mergeCredits | ReactProjectTool.ts | ? |
| metadata | EnterprisePlatformFoundationTool.ts | ? |
| missingLocalRuntimeImports | ProjectRunTool.ts | ? |
| missingRuntimeDependencies | ProjectRunTool.ts | ? |
| modelCannotTell | ProjectEditTool.ts | ? |
| mountEntities | ApiProjectTool.ts | ? |
| namesAnExternalTarget | BrowserRunTool.ts | ? |
| nativeBuildToolRepairSpec | ReactProjectTool.ts | ? |
| normalizeEmail | ApiProjectTool.ts | ? |
| normalizeReactScaffoldStructure | SystemTools.ts | ? |
| noteMiss | ApiProjectTool.ts | ? |
| nowFacts | CentralAnswerTool.ts | ? |
| npmInstallTimeoutMs | SystemTools.ts | ? |
| npmPackageNameForTest | react-app-templates.ts | ? |
| optionalAuth | ApiProjectTool.ts, AuthBuilderTool.ts | ? |
| ownRowsOnly | ApiProjectTool.ts | ? |
| pages | ReactProjectTool.ts | ? |
| pagesForKind | ReactProjectTool.ts | ? |
| parseEditBlocks | ProjectEditTool.ts | ? |
| parseLiteralTextReplacement | ProjectEditTool.ts | ? |
| parsePresentationEdits | ProjectEditTool.ts | ? |
| parseServicesSectionEdit | ProjectEditTool.ts | ? |
| photoRows | ProjectEditTool.ts | ? |
| pickImage | react-app-templates.ts | ? |
| pickPhotoRow | ProjectEditTool.ts | ? |
| placeholderLifecycleScriptError | ProjectRunTool.ts | ? |
| planContainsReactBuilder | ProjectPipelineTool.ts | ? |
| planContainsTool | ProjectPipelineTool.ts | ? |
| planContainsUnrequestedApiBuilder | ProjectPipelineTool.ts | ? |
| portableViteBuildArgs | ReactProjectTool.ts | ? |
| previewUrlFromStatus | ReactProjectTool.ts | ? |
| projectAuditDirectory | ProjectPipelineTool.ts | ? |
| projectAuditRoots | ProjectPipelineTool.ts | ? |
| projectDirNameForTest | ReactProjectTool.ts | ? |
| projectRootFromWrittenFile | PhaseExecutorTool.ts | ? |
| provesContactLinkAndPhoneAudit | ProjectEditTool.ts | ? |
| rankFilesForEdit | ProjectEditTool.ts | ? |
| reactProjectServerFallback | PhaseExecutorTool.ts | ? |
| reactProjectStartFallback | PhaseExecutorTool.ts | ? |
| readOrders | OrdersReadTool.ts | ? |
| reconcileDeliveryVoices | ReactProjectTool.ts | ? |
| reconcileMissingRuntimeImports | ProjectRunTool.ts | ? |
| reconcileMissingRuntimeTarget | ProjectRunTool.ts | ? |
| reconcileNpmManifest | SystemTools.ts | ? |
| recoverMissingNpmLauncher | PhaseExecutorTool.ts | ? |
| refusalOf | react-app-templates.ts | ? |
| repairNpmManifestVersion | SystemTools.ts | ? |
| repairRecordsViewBlankImport | ReactProjectTool.ts | ? |
| repairRecordsViewToggleControl | ReactProjectTool.ts | ? |
| repairRecordsViewVisualBaseline | ReactProjectTool.ts | ? |
| requestDerivedEngineFallbackEligible | ReactProjectTool.ts | ? |
| requestDerivedRecordsPresentation | ReactProjectTool.ts | ? |
| requestDrivenServiceProducts | ReactProjectTool.ts | ? |
| requestFidelityEvidenceUnavailable | ReactProjectTool.ts | ? |
| requestFidelityMismatch | ReactProjectTool.ts | ? |
| requestRequiresLocalSpecification | ProjectPipelineTool.ts | ? |
| requestSpokenCapabilities | ReactProjectTool.ts | ? |
| requestedBoardField | react-app-templates.ts | ? |
| requestsVisibleBrowserAudit | ProjectEditTool.ts | ? |
| requireAuth | ApiProjectTool.ts | ? |
| requireRole | ApiProjectTool.ts | ? |
| requireSession | AuthBuilderTool.ts | ? |
| requireWrite | ApiProjectTool.ts | ? |
| resolveProjectIdentity | ProjectPipelineTool.ts | ? |
| resolveRunnableProject | ProjectRunTool.ts | ? |
| reuseLocalReactDependencies | ReactProjectTool.ts | ? |
| scopeOf | ApiProjectTool.ts | ? |
| scopedNpmCache | ReactProjectTool.ts | ? |
| sectionNameFor | ReactProjectTool.ts | ? |
| sectionsForKind | ReactProjectTool.ts | ? |
| sectionsForRequest | ReactProjectTool.ts | ? |
| seed | ApiProjectTool.ts | ? |
| seedOwner | ApiProjectTool.ts | ? |
| selectApiPrimary | ApiProjectTool.ts | ? |
| selectStableNpmVersion | SystemTools.ts | ? |
| sessionConfig | AuthBuilderTool.ts | ? |
| setupOAuth | AuthBuilderTool.ts | ? |
| setupSession | AuthBuilderTool.ts | ? |
| shouldRepairInterruptedNativeBuildTools | ReactProjectTool.ts | ? |
| shouldUseActiveProjectDirectly | ProjectRunTool.ts | ? |
| signToken | ApiProjectTool.ts | ? |
| snapshotBefore | ProjectUndoTool.ts | ? |
| sourceRepairAllowedForArtifact | ReactProjectTool.ts | ? |
| store | MobileBuilderTool.ts | ? |
| summarizeScopeRepairPipeline | ProjectPipelineTool.ts | ? |
| syntaxOk | ProjectEditTool.ts | ? |
| theServerThisSessionLeftRunning | ProjectRunTool.ts | ? |
| throttleKey | ApiProjectTool.ts | ? |
| toCsv | react-app-templates.ts | ? |
| todayISO | react-app-templates.ts | ? |
| uid | react-app-templates.ts | ? |
| unparenthesizedLogicalTernaryError | AIGeneratorTool.ts | ? |
| useApp | MobileBuilderTool.ts | ? |
| usePath | ReactProjectTool.ts | ? |
| useRecordsController | react-app-templates.ts | ? |
| useReveal | ReactProjectTool.ts | ? |
| useStore | MobileBuilderTool.ts, react-app-templates.ts | app |
| verifyPassword | ApiProjectTool.ts | ? |
| verifyToken | ApiProjectTool.ts, AuthBuilderTool.ts | ? |
| wantsMultiPage | ReactProjectTool.ts | ? |
| writeDependencyFreeRecordsBundle | ReactProjectTool.ts | ? |
| x | UtilityTools.ts | ? |
| yieldToDiscoveryScheduler | EngineeringDiscoveryTool.ts | ? |

## TOOL-CLASS level (block has tool name + execute member)

TOOL_CLASSES=167
TOOL_CLASSES_REGISTERED=162
TOOL_CLASSES_NOT_REGISTERED=5

| symbol | file(s) | tool name |
|---|---|---|
| BulkFileGeneratorTool | BulkFileGeneratorTool.ts | bulk_file_generator |
| CodebaseNavigatorTool | CodebaseNavigatorTool.ts | codebase_navigator |
| ImageGenerationTool | ImageGenerationTool.ts | generate_image |
| GrepSearchTool | SystemTools.ts | grep_search |
| VisualQATool | VisualQATool.ts | visual_qa |

## REFERENCED_NOT_IMPLEMENTED (registry references, no export found)

(none)

## EliteTools referenced-but-missing

(none)
