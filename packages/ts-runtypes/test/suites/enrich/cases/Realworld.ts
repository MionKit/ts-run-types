import type * as TF from 'ts-runtypes/formats';
import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichCase} from './types.ts';

// Real-world composite shapes — nested objects, arrays, and format-branded
// members combined the way an application model looks. Exercises the full walk
// end-to-end. Mirrors the validation suite's REALWORLD range.
export const REALWORLD = {
  user: {
    title: 'User profile object',
    case: () => {
      // ##### src #####
      interface User {
        id: number;
        name: string;
        email: string;
        tags: string[];
        profile: {bio: string; age: number};
      }
      type Target = User;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        id: {$label: '', $errors: {type: ''}},
        name: {$label: '', $errors: {type: ''}},
        email: {$label: '', $errors: {type: ''}},
        tags: {$label: '', $errors: {type: ''}, $items: {$label: '', $errors: {type: ''}}},
        profile: {
          $label: '',
          $errors: {type: ''},
          bio: {$label: '', $errors: {type: ''}},
          age: {$label: '', $errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        id: {pool: []},
        name: {pool: []},
        email: {pool: []},
        tags: {$items: {pool: []}, $length: [1, 3]},
        profile: {
          bio: {pool: []},
          age: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  registrationForm: {
    title: 'Registration form with formats',
    case: () => {
      // ##### src #####
      interface RegistrationForm {
        username: TF.String<{minLength: 3; maxLength: 20}>;
        email: TF.Email;
        age: TF.Number<{min: 18; max: 120}>;
        website: TF.Url;
      }
      type Target = RegistrationForm;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        username: {$label: '', $errors: {type: '', maxLength: '', minLength: ''}},
        email: {$label: '', $errors: {type: '', maxLength: '', minLength: '', pattern: ''}},
        age: {$label: '', $errors: {type: '', max: '', min: ''}},
        website: {$label: '', $errors: {type: '', maxLength: '', pattern: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        username: {pool: []},
        email: {pool: []},
        age: {pool: []},
        website: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  order: {
    title: 'Order with nested line items',
    case: () => {
      // ##### src #####
      interface Order {
        orderId: string;
        total: number;
        items: {sku: string; qty: number; price: number}[];
        shipping: {address: string; city: string; zip: string};
      }
      type Target = Order;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        orderId: {$label: '', $errors: {type: ''}},
        total: {$label: '', $errors: {type: ''}},
        items: {
          $label: '',
          $errors: {type: ''},
          $items: {
            $label: '',
            $errors: {type: ''},
            sku: {$label: '', $errors: {type: ''}},
            qty: {$label: '', $errors: {type: ''}},
            price: {$label: '', $errors: {type: ''}},
          },
        },
        shipping: {
          $label: '',
          $errors: {type: ''},
          address: {$label: '', $errors: {type: ''}},
          city: {$label: '', $errors: {type: ''}},
          zip: {$label: '', $errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        orderId: {pool: []},
        total: {pool: []},
        items: {
          $items: {
            sku: {pool: []},
            qty: {pool: []},
            price: {pool: []},
          },
          $length: [1, 3],
        },
        shipping: {
          address: {pool: []},
          city: {pool: []},
          zip: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  blogPost: {
    title: 'Blog post with arrays and dates',
    case: () => {
      // ##### src #####
      interface BlogPost {
        title: string;
        body: string;
        publishedAt: Date;
        tags: string[];
        author: {name: string; email: string};
      }
      type Target = BlogPost;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        title: {$label: '', $errors: {type: ''}},
        body: {$label: '', $errors: {type: ''}},
        publishedAt: {$label: '', $errors: {type: ''}},
        tags: {$label: '', $errors: {type: ''}, $items: {$label: '', $errors: {type: ''}}},
        author: {
          $label: '',
          $errors: {type: ''},
          name: {$label: '', $errors: {type: ''}},
          email: {$label: '', $errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        title: {pool: []},
        body: {pool: []},
        publishedAt: {pool: []},
        tags: {$items: {pool: []}, $length: [1, 3]},
        author: {
          name: {pool: []},
          email: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
