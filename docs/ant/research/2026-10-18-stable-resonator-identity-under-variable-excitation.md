# Stable Resonator Identity Under Variable Excitation

> Source: Consensus Deep Review PDF, I_am_developing_an_agent-based_simulation_in_which.pdf, generated 2026-10-18.
>
> Repository role: external literature synthesis for research context. This is not ANT implementation evidence and does not supersede current code, docs/ant/README.md, or dated ANT evidence.
>
> Source preservation: the original PDF remains in the ChatGPT ANT_2026 project sources. This Markdown copy preserves the report's substantive findings, evidence hierarchy, research gaps, open questions, and bibliography in searchable form. Visual charts are represented textually; the PDF remains authoritative for original layout.

The report's central conclusion is that the literature does not support defining the same plate-like resonator by strict acoustic invariance across strike or listening position. Instead, it supports a source-constancy view: excitation position, impactor, force, and observation position can lawfully change the emitted sound while leaving deeper structural cues sufficiently stable for listeners to treat the sounds as arising from the same kind of object.

For impacted solids, the strongest recurring distinction is between structural invariants linked to the resonator and transformational invariants linked to the action. Listeners can flexibly weight cues according to task. Direct evidence for recognition of one specific individual plate across controlled position changes is limited, so the report treats individual-resonator constancy as a plausible framework rather than an established psychophysical fact.

## 1. Introduction

The review sits at the junction of plate vibroacoustics, impact-sound perception, and auditory object constancy.

The physical literature predicts substantial within-object acoustic variability from lawful changes in excitation point, modal participation, radiation pattern, and listener position. The perceptual literature shows that listeners often separate object-related from event-related information rather than demanding waveform identity.

Across the corpus, three conclusions recur:

1. Impact sounds are jointly determined by object and event variables, so constancy is an inference problem rather than a raw-acoustical equality problem.
2. Material and resonator judgments rely strongly on damping, decay, and spectral structure, but cue weights change with task, context, and stimulus set.
3. Action identity is often more robust than material identity, so large within-object variation can coexist with stable higher-level source interpretation when the variation is predictable and ecologically plausible.

## 2. Methods

Consensus searched more than 220 million indexed papers across Semantic Scholar, PubMed, and other scholarly sources. The corpus combined plate vibration/radiation studies, impact-sound perception, auditory object/event perception, and timbre-constancy work.

The review prioritized studies directly addressing excitation position, observation position, material-versus-action cues, and perceptual constancy in non-speech sounds.

The report records 12 searches, one citation-graph use, roughly 1.4 million retrieved records, 390 eligible papers after screening/deduplication, and 100 papers selected for final analysis.

## 3. Results

### 3.1 Key papers

A small set of papers anchors the report because they connect physical source variables to perceptual judgments about impacted objects.

- Giordano & McAdams (2006): material identification from real plates is possible, but cue use is task dependent and not reducible to one invariant.
- McAdams et al. (2010): synthetic impacted thin plates separate a wave-velocity/pitch-related dimension from a damping/timbre-duration dimension.
- Traer & McDermott (2018) and Agarwal et al. (2024): impact-sound perception can be framed as inverse physics in which listeners infer latent physical causes rather than reading out one acoustic cue.

### 3.2 Physics of variation

For linear plate models, changing strike position primarily changes initial modal amplitudes rather than the underlying modal frequencies. Geometry and material determine the modal structure, while impact location changes which modes are excited and with what weight.

The same plate can therefore sound darker, brighter, denser, or thinner across hitpoints without any change in its underlying resonator.

Observation position also changes the radiated sound field. Dataset and plate-radiation studies report position-dependent acoustic transfer and directivity as functions of excitation position, frequency, aspect ratio, and mode family.

The review's compact physical implication is:

> Same resonator should not mean the same spectrum at every hitpoint or pickup. It should mean stable underlying modal structure and damping organization under lawful reweighting by excitation and radiation.

### 3.3 Identity versus event

| Dimension | Object / resonator side | Action / event side |
| --- | --- | --- |
| Dominant cues | Spectral structure, decay, damping | Temporal centroid, impact density, force pattern |
| Robustness | Often weaker and task dependent | Often faster and more accurate |
| Neural/task framing | Object emphasis depends on task | Action emphasis depends on task |
| Computational framing | Structural invariants | Transformational invariants |
| Inference framing | Resonances constrain material/object | Event force can be inferred separately |

Listeners can extract both object and event information from one impact, but not with equal robustness. Action judgments are often faster and more accurate than material judgments, and task demands alter which category is emphasized.

The report therefore argues that a system can support stable resonator identity without suppressing audible event variation, because perception already treats source and action as partially separable causes.

### 3.4 Perceptual cue structure

The most repeatedly supported timbral dimensions for impacted resonators are:

- spectral envelope or spectral centroid;
- decay and damping;
- attack-related timing, including attack temporal centroid;
- spectrotemporal variability and aperiodicity.

Damping is recurrent but not a universal master cue. Some studies find decay important for gross material grouping, while others find frequency cues important for fine distinctions or mixed support for damping-only accounts.

Roughness and inharmonicity contribute to timbral quality, tension, segregation, and material contrast, but the report does not find evidence that either is a sole carrier of object identity.

The literature has shifted historically from searches for simple acoustic invariants toward task-dependent inference and perceptual constancy under lawful variability.

## 4. Discussion

The corpus is strongest on three points.

1. Physics robustly predicts that one plate can produce many different sounds under different hitpoints and observation positions without changing its underlying modal structure.
2. Perception robustly distinguishes object-related from action-related information, but only partially and in a task-dependent way.
3. Auditory constancy more generally does not require acoustic sameness. It requires tolerance to identity-preserving transformations and can rely on learned priors about lawful variability.

The main limitation is directness. Targeted experiments that ask whether listeners recognize one specific plate across systematic strike-position and pickup/listener-position changes are scarce. Most plate studies stop at material, geometry, or similarity judgments; most auditory-constancy studies use speech-like or broad environmental categories rather than impacted plates.

The framework is therefore well supported at the level of lawful within-object variability, cue stability, and general perceptual-constancy principles, but weakly established for literal individual-plate identity across position changes.

### Evidence strength recorded by the review

| Claim | Strength | Reason |
| --- | --- | --- |
| Same plate, different hitpoints should sound different | Strong | Physical agreement on modal reweighting by contact location |
| Observation position changes radiated spectrum/transfer | Strong | Physical and dataset evidence for position-dependent radiation |
| Object and event cues are partially separable | Strong | Behavioral, neural, and modeling evidence converge |
| Damping is useful but not universally dominant | Moderate | Repeated support, but mixed across tasks and stimulus sets |
| Individual-plate identity across position changes is directly established | Weak | Plausible inference, sparse direct targeted evidence |

## 5. Conclusion

The report supports a definition of resonator identity based on structured variability, not invariance.

For plate-like sources, excitation and observation legitimately alter the audible event, while listeners can still rely on more stable resonator-linked cues, learned physical regularities, and context to maintain source constancy.

Its most defensible final formulation is:

> A stable plate identity is a stable latent cause with lawful acoustic variation, not a fixed sound.

## Research gaps

The corpus covers material perception, action perception, plate physics, and general auditory constancy well, but sparsely samples the exact intersection relevant here: single-resonator identity under controlled variation of hitpoint and observation point.

Plate-acoustics studies characterize spatially varying radiation and excitation dependence, but rarely ask whether listeners still recognize a continuing resonator as the same source. Constancy studies show tolerance across identity-preserving changes, but usually do not manipulate impacted-plate hitpoint and listener position directly.

Nonlinear plate behavior is also under-integrated with perception, despite evidence that damping and high-frequency energy cascades alter judgments such as perceived thickness.

## Open research questions

- Across how much strike-position variation do listeners still judge one plate as the same individual resonator?
- Which cue families remain stable enough for same-resonator judgments when listener position changes around a plate?
- Do listeners treat nonlinear plate effects as identity-preserving growth of one object or as a change of source class?

## References

- Agarwal, V., Traer, J., & McDermott, J. H. (2024). Human perception of impact sounds suggests auditory intuitive physics. The Journal of the Acoustical Society of America. https://doi.org/10.1121/10.0027604
- Agarwal, V., Traer, J., Schwartz, J., & McDermott, J. H. (2026). Intuitive knowledge of object acoustics enables perceptual separation of physical variables from impact sounds. bioRxiv. https://doi.org/10.64898/2026.01.28.702236
- Ahveninen, J., et al. (2015). Interacting parallel pathways associate sounds with visual identity in auditory cortices. NeuroImage. https://doi.org/10.1016/j.neuroimage.2015.09.044
- Alavilli, S., & McDermott, J. H. (2026). From sound to source: Human and model recognition of environmental sounds. bioRxiv. https://doi.org/10.64898/2026.03.12.711349
- Aramaki, M., Besson, M., Kronland-Martinet, R., & Ystad, S. (2011). Controlling the Perceived Material in an Impact Sound Synthesizer. IEEE Transactions on Audio, Speech, and Language Processing. https://doi.org/10.1109/tasl.2010.2047755
- Basiński, K., et al. (2025). Inharmonicity enhances brain signals of attentional capture and auditory stream segregation. Communications Biology. https://doi.org/10.1038/s42003-025-08999-5
- Bourquin, N., Murray, M. M., & Clarke, S. (2013). Location-independent and location-linked representations of sound objects. NeuroImage. https://doi.org/10.1016/j.neuroimage.2013.01.026
- Clarke, S., et al. (2023). REALIMPACT: A Dataset of Impact Sound Fields for Real Objects. CVPR. https://doi.org/10.1109/cvpr52729.2023.00152
- Ducceschi, M., & Touzé, C. (2015). Modal approach for nonlinear vibrations of damped impacted plates: Application to sound synthesis of gongs and cymbals. Journal of Sound and Vibration. https://doi.org/10.1016/j.jsv.2015.01.029
- Giordano, B. L., & McAdams, S. (2006). Material identification of real impact sounds: effects of size variation in steel, glass, wood, and plexiglass plates. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.2149839
- Han, M., Zhang, G.-B., & Zhang, X.-F. (2024). Study on the radiation directivity of a ring-excited thin circular plate with a fixed boundary. Ultrasonics. https://doi.org/10.1016/j.ultras.2024.107441
- Heald, S. M., Van Hedger, S. C., & Nusbaum, H. (2017). Perceptual Plasticity for Auditory Object Recognition. Frontiers in Psychology. https://doi.org/10.3389/fpsyg.2017.00781
- Hjortkjær, J., & McAdams, S. (2016). Spectral and temporal cues for perception of material and action categories in impacted sound sources. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.4955181
- Hjortkjær, J., et al. (2017). Task-Modulated Cortical Representations of Natural Sound Source Categories. Cerebral Cortex. https://doi.org/10.1093/cercor/bhx263
- Huynh, E., & McAdams, S. (2024). Categorization of Typical and Atypical Combinations of Excitations and Resonators of Musical Instruments: Assimilation of the Unusual to the Familiar. Music & Science. https://doi.org/10.1177/20592043241285667
- Kazazis, S. N., Depalle, P., & McAdams, S. (2021). Ordinal scaling of temporal audio descriptors and perceptual significance of attack temporal centroid in timbre spaces. The Journal of the Acoustical Society of America. https://doi.org/10.1121/10.0006788
- Klatzky, R., Pai, D., & Krotkov, E. (2000). Perception of Material from Contact Sounds. Presence. https://doi.org/10.1162/105474600566907
- Koumura, T., & Furukawa, S. (2017). Context-Dependent Effect of Reverberation on Material Perception from Impact Sound. Scientific Reports. https://doi.org/10.1038/s41598-017-16651-4
- Lemaitre, G., & Heller, L. (2012). Auditory perception of material is fragile while action is strikingly robust. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.3675946
- Li, Q., & Thompson, D. (2019). Directivity of sound radiated from baffled rectangular plates and plate strips. Applied Acoustics. https://doi.org/10.1016/j.apacoust.2019.05.018
- Lutfi, R. A., Liu, C.-J., & Stoelinga, C. N. J. (2008). Level dominance in sound source identification. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.2998767
- Lutfi, R. A., & Stoelinga, C. N. J. (2010). Sensory constraints on auditory identification of the material and geometric properties of struck bars. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.3263606
- McAdams, S., Chaigne, A., & Roussarie, V. (2004). The psychomechanics of simulated sound sources: material properties of impacted bars. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.1645855
- McAdams, S., Roussarie, V., Chaigne, A., & Giordano, B. L. (2010). The psychomechanics of simulated sound sources: material properties of impacted thin plates. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.3466867
- Ogg, M., & Slevc, L. (2019). Acoustic Correlates of Auditory Object and Event Perception. Frontiers in Psychology. https://doi.org/10.3389/fpsyg.2019.01594
- Poirot, S., Bourachot, A., Bilbao, S., & Kronland-Martinet, R. (2024). Auditory perception of the thickness of plates. JASA Express Letters. https://doi.org/10.1121/10.0024216
- Robert, P., et al. (2024). Auditory hemispheric asymmetry for actions and objects. Cerebral Cortex. https://doi.org/10.1093/cercor/bhae292
- Saitis, C., & Siedenburg, K. (2020). Brightness perception for musical instrument sounds: Relation to timbre dissimilarity and source-cause categories. The Journal of the Acoustical Society of America. https://doi.org/10.1121/10.0002275
- Soares, F., & Debut, V. (2026). Acoustic radiation from vibrating plates using minimal modal sets of elementary sources. Journal of Sound and Vibration. https://doi.org/10.1016/j.jsv.2026.120017
- Town, S., Wood, K. C., & Bizley, J. (2018). Sound identity is represented robustly in auditory cortex during perceptual constancy. Nature Communications. https://doi.org/10.1038/s41467-018-07237-3
- Traer, J., & McDermott, J. H. (2016). Statistics of natural reverberation enable perceptual separation of sound and space. PNAS. https://doi.org/10.1073/pnas.1612524113
- Traer, J., & McDermott, J. H. (2018). Human inference of force from impact sounds: Perceptual evidence for inverse physics. The Journal of the Acoustical Society of America. https://doi.org/10.1121/1.5035721
- Winkler, I., Denham, S., & Nelken, I. (2009). Modeling the auditory scene: predictive regularity representations and perceptual objects. Trends in Cognitive Sciences. https://doi.org/10.1016/j.tics.2009.09.003
- Winkler, I., & Denham, S. (2024). The role of auditory source and action representations in segmenting experience into events. Nature Reviews Psychology. https://doi.org/10.1038/s44159-024-00287-z
- Zacharakis, A., & Pastiadis, K. (2021). Interaction between time-varying tone inharmonicity, fundamental frequency and spectral shape affects felt tension and timbral semantics. Acta Acustica. https://doi.org/10.1051/aacus/2021007

> Consensus copyright notice in the source PDF: personal, non-commercial use only; redistribution requires copyright holders' consent.
