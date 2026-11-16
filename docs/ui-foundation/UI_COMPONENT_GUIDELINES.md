# UI Component Guidelines — 37MusicStudio

Panduan standar penggunaan dan pengembangan komponen UI modular di `src/components/`.

## 1. Aturan Dasar Pengembangan Komponen

1. **JavaScript + JSX Saja**: Pertahankan `.js` untuk utilitas/varian CVA murni dan `.jsx` untuk komponen React. Pisahkan konstanta CVA (contoh: `buttonVariants.js`, `badgeVariants.js`) dari file komponen `.jsx` agar `react-refresh/only-export-components` tetap bersih.
2. **Gunakan `cn()` untuk Penggabungan Class**: Impor `cn` dari `src/lib/utils/cn.js` saat menerima prop `className`.
3. **Zero Hardcoded Colors**: Jangan gunakan kode hex atau `rgba()` warna gelap mentah di komponen UI/fitur; selalu gunakan utility semantik Tailwind (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`) atau token CSS (`var(--success)`, `var(--surface-standard)`).
4. **Aksesibilitas & Reduced Motion**:
   - Gunakan `@base-ui/react` untuk primitif interaktif (focus management, keyboard navigation, ARIA otomatis).
   - Pastikan semua tombol ikon memiliki `aria-label`.
   - Jangan menambahkan animasi wajib; gunakan primitif dari `src/components/motion/MotionPrimitives.jsx` karena sudah berada di bawah `<MotionConfig reducedMotion="user">`.

## 2. Katalog Komponen Fondasi

### Primitif Dasar (`src/components/ui/`)
- `Button`: Varian `primary | secondary | outline | ghost | danger | success`, ukuran `xs | sm | md | lg | icon`, dan prop `loading`.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`: Varian `default | elevated | glass | subtle`.
- `Badge`: Varian `neutral | primary | secondary | success | warning | danger | info | outline`.
- `Input`, `Textarea`, `Label`, `Skeleton`: Kontrol input terstandar dengan prop `invalid` dan `required`.
- Primitif Base UI: `SelectField`, `ComboboxField`, `SwitchControl`, `CheckboxControl`, `RadioGroupControl`, `DialogModal`, `DrawerSheet`, `PopoverMenu`, `DropdownMenu`, `TooltipHint`, `TabsControl`, `ProgressBar`.

### Feedback (`src/components/feedback/`)
- `AppToaster` + `notify` (`src/components/feedback/toast.js`): Toast `notify.success()`, `notify.error()`, `notify.info()`, `notify.warning()`, `notify.promise()`.
- `ConfirmDialog`: Dialog konfirmasi destruktif/aksi penting berbasis `@base-ui/react/alert-dialog`.
- `AlertBanner`: Banner status `info | success | warning | danger`.

### Navigasi (`src/components/navigation/`)
- `ThemeToggle`: Mode `segmented` atau `compact` untuk mengganti tema `light | dark | system`.
- `BreadcrumbTrail`: Breadcrumb otomatis berbasis `navItems` portal aktif & URL path.
- `CommandPalette`: Pencarian cepat `Ctrl+K`/`Cmd+K` (`cmdk` + Base UI `Dialog`). Selalu terikat ketat hanya pada `navItems` milik portal pengguna yang sedang login.

### Formulir (`src/components/forms/`)
- `FormField`: Pembungkus label, hint, `aria-invalid`, `aria-describedby`, dan pesan error `role="alert"`. Cocok dipadukan dengan `createZodFormConfig` & `extractFieldErrorMessage` dari `src/lib/validation/formHelpers.js`.
- `DatePickerField`: Kalender single-date berbasis `react-day-picker` v10 + locale Indonesia (`date-fns/locale/id`) di dalam Base UI `Popover`.
- `ComboboxField`: Select dengan pencarian teks berbasis `@base-ui/react/combobox`.
- `FileUploadDropzone`: UI dropzone drag-and-drop dengan validasi ukuran lokal sebelum diteruskan ke service upload fitur (mis. Cloudinary).

### Data Display (`src/components/data-display/`)
- `DataTable`: Tabel headless `@tanstack/react-table` v9 dengan fitur global search (`includesString`), sorting multi-tipe (`alphanumeric`, `basic`, `datetime`, `text`), paginasi client, dan mode virtualisasi baris (`virtualized`) via `@tanstack/react-virtual`.
- `ChartSurface`: Wrapper Apache ECharts lazy-loaded dengan `ResizeObserver` responsif dan palet otomatis Light/Dark.
- `StatCard`, `StatusBadge`, `EmptyState`.

## 3. Contoh Integrasi Formulir (React Hook Form + Zod)

```jsx
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createZodFormConfig, extractFieldErrorMessage } from '../../lib/validation/formHelpers.js';
import { FormField } from '../../components/forms/FormField.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';

const studioSchema = z.object({
  studioName: z.string().min(2, 'Nama studio minimal 2 karakter'),
});

export function ExampleForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors } } = useForm(
    createZodFormConfig(studioSchema, { studioName: '' })
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormField label="Nama Studio" required error={extractFieldErrorMessage(errors, 'studioName')}>
        <Input {...register('studioName')} placeholder="Contoh: Studio A" />
      </FormField>
      <Button type="submit" variant="primary">Simpan</Button>
    </form>
  );
}
```
